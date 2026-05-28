// src/services/autoSyncManager.ts
// Auto-sync manager: syncs on DB changes, handles offline, queues syncs

import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { API_URL } from '../../config/api'
import { database } from '../database/initializeDatabase'
import { syncDatabase } from './syncWatermelon'

// Storage helper
const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key)
    }
    return await AsyncStorage.getItem(key)
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value)
      return
    }
    await AsyncStorage.setItem(key, value)
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key)
      return
    }
    await AsyncStorage.removeItem(key)
  },
}

const SYNC_QUEUE_KEY = 'sync:queue'
const PENDING_SYNC_KEY = 'sync:pending'

// Network detection (simple approach - can be enhanced with NetInfo)
let isOnline = true
let networkListeners: Array<(isOnline: boolean) => void> = []

/**
 * Check if device is online
 * Uses browser API for web, tries API server for native/web
 */
async function checkNetworkStatus(): Promise<boolean> {
  // For web, use navigator.onLine (browser API)
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      if (!navigator.onLine) {
        return false
      }
    }
  }

  // Try to ping the actual API server (which should work since it's your server)
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2000) // 2 second timeout

    // Try to reach the API server root endpoint
    const response = await fetch(API_URL, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-cache',
    })

    clearTimeout(timeoutId)
    // If we get any response (even 404), we're online

    // console.log('[DEBUG] checkNetworkStatus: fetch OK on', Platform.OS)
    return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log('[DEBUG] checkNetworkStatus: fetch ERROR on', Platform.OS, message)

      // ignore bug "Cannot assign to read-only property 'NONE'"
      if (message.includes("Cannot assign to read-only property 'NONE'")) {
        console.log('[DEBUG] Ignoring NONE bug in fetch, treating as ONLINE')
        return true
      }
      return false
    }
}



/**
 * Update network status and notify listeners
 */
async function updateNetworkStatus() {
  const wasOnline = isOnline
  isOnline = await checkNetworkStatus()

  if (wasOnline !== isOnline) {
    console.log(`[AUTO-SYNC] Network status changed: ${isOnline ? 'ONLINE' : 'OFFLINE'}`)
    networkListeners.forEach(listener => listener(isOnline))

    // If we just came back online, trigger queued syncs
    if (isOnline && !wasOnline) {
      console.log('[AUTO-SYNC] Network back online, processing queued syncs...')
      await processSyncQueue()
    }
  }
}

/**
 * Subscribe to network status changes
 */
export function onNetworkChange(callback: (isOnline: boolean) => void) {
  networkListeners.push(callback)
  return () => {
    networkListeners = networkListeners.filter(l => l !== callback)
  }
}

/**
 * Get current network status
 */
export function getNetworkStatus(): boolean {
  return isOnline
}

/**
 * Queue a sync for later (when offline)
 */
async function queueSync() {
  const queue = await getSyncQueue()
  const timestamp = Date.now()
  
  // Add sync request to queue if not already queued recently (debounce)
  const recentSync = queue.find(s => timestamp - s < 5000) // 5 second debounce
  if (!recentSync) {
    queue.push(timestamp)
    await storage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue))
    console.log('[AUTO-SYNC] Sync queued (offline). Queue size:', queue.length)
  }
}

/**
 * Get sync queue
 */
async function getSyncQueue(): Promise<number[]> {
  const queueStr = await storage.getItem(SYNC_QUEUE_KEY)
  if (!queueStr) return []
  try {
    return JSON.parse(queueStr)
  } catch {
    return []
  }
}

/**
 * Clear sync queue
 */
async function clearSyncQueue() {
  await storage.removeItem(SYNC_QUEUE_KEY)
}

/**
 * Process queued syncs
 */
async function processSyncQueue() {
  if (!isOnline) {
    console.log('[AUTO-SYNC] Still offline, cannot process queue')
    return
  }

  const queue = await getSyncQueue()
  if (queue.length === 0) return

  console.log(`[AUTO-SYNC] Processing ${queue.length} queued sync(s)...`)

  try {
    await performSync()
    await clearSyncQueue()
    console.log('[AUTO-SYNC] Queue processed successfully')
  } catch (error) {
    console.error('[AUTO-SYNC] Failed to process queue:', error)
    // Keep queue for retry later
  }
}

/**
 * Perform sync with error handling
 */
async function performSync(): Promise<void> {
  const result = await syncDatabase()
  if (!result.success) {
    throw new Error(result.error || 'Sync failed')
  }
}

/**
 * Check if auth token is available
 */
async function hasAuthToken(): Promise<boolean> {
  const token = await storage.getItem('auth:token')
  // console.log('[AUTO-SYNC][DEBUG] hasAuthToken: auth:token =', token)

  if (token) return true

  // Fallback: check auth:user
  const userStr = await storage.getItem('auth:user')
  console.log('[AUTO-SYNC][DEBUG] hasAuthToken: auth:user =', userStr)

  if (userStr) {
    try {
      const user = JSON.parse(userStr)
      const hasUserToken = !!user.token
      console.log('[AUTO-SYNC][DEBUG] hasAuthToken: user.token exists =', hasUserToken)
      return hasUserToken
    } catch (e) {
      console.log('[AUTO-SYNC][DEBUG] hasAuthToken: error parsing auth:user', String(e))
      return false
    }
  }

  return false
}

/**
 * Trigger sync (with network check and queueing)
 */
async function triggerSync(): Promise<void> {
  // Check if user is authenticated (has token)
  const hasToken = await hasAuthToken()
  if (!hasToken) {
    console.log('[AUTO-SYNC] No auth token - skipping sync. Please login first.')
    return
  }

  // Check network status
  await updateNetworkStatus()

  if (!isOnline) {
    console.log('[AUTO-SYNC] Offline - queueing sync for later')
    await queueSync()
    return
  }

  // Check if sync is already in progress
  const pendingSync = await storage.getItem(PENDING_SYNC_KEY)
  if (pendingSync) {
    console.log('[AUTO-SYNC] Sync already in progress, skipping...')
    return
  }

  try {
    // Mark sync as pending
    await storage.setItem(PENDING_SYNC_KEY, String(Date.now()))

    console.log('[AUTO-SYNC] Triggering sync...')
    await performSync()
    console.log('[AUTO-SYNC] Sync completed successfully')
  } catch (error) {
    console.error('[AUTO-SYNC] Sync failed:', error)
    
    // If 401 (unauthorized), don't queue - user needs to login
    if (error instanceof Error && error.message.includes('401')) {
      console.log('[AUTO-SYNC] Authentication required - please login to enable sync')
      return
    }
    
    // If network error, queue for later
    if (error instanceof Error && (error.message.includes('fetch') || error.message.includes('network'))) {
      await queueSync()
    }
  } finally {
    // Clear pending flag
    await storage.removeItem(PENDING_SYNC_KEY)
  }
}

// Debounce sync calls (wait a bit before syncing after changes)
let syncTimeout: ReturnType<typeof setTimeout> | null = null
const SYNC_DEBOUNCE_MS = 2000 // Wait 2 seconds after last change before syncing

// Periodic pull from server (even if no local changes)
// Set to 0 to disable periodic pulls (only pull when there are local changes)
const PERIODIC_PULL_INTERVAL_MS = 10000 // Pull from server every 10 seconds (0 = disabled)

/**
 * Trigger sync with debouncing
 */
function triggerSyncDebounced() {
  if (syncTimeout) {
    clearTimeout(syncTimeout)
  }

  syncTimeout = setTimeout(() => {
    triggerSync().catch(console.error)
    syncTimeout = null
  }, SYNC_DEBOUNCE_MS)
}

/**
 * Watch for database changes and auto-sync
 * We'll use a polling approach to check for unsynced changes
 */
let isWatching = false
let watchInterval: ReturnType<typeof setInterval> | null = null
let periodicPullInterval: ReturnType<typeof setInterval> | null = null

/**
 * Check if there are unsynced changes in the database
 */
async function hasUnsyncedChanges(): Promise<boolean> {
  try {
    const tables = [
      'users',
      'customers',
      'customer_phones',
      'customer_addresses',
      'orders',
      'order_items',
      'shelves',
      'warehouse_items',
      'activity_logs',
      'pickups',
      'payments',
    ]

    for (const tableName of tables) {
      const collection = database.get(tableName)
      const records = await collection.query().fetch()
      
      // Check if any record has unsynced status
      for (const record of records) {
        const raw = (record as any)._raw
        const status = raw._status
        
        // If any record is created, updated, or deleted, we have unsynced changes
        if (status === 'created' || status === 'updated' || status === 'deleted') {
          return true
        }
      }
    }

    return false
  } catch (error) {
    console.error('[AUTO-SYNC] Error checking for unsynced changes:', error)
    return false
  }
}

/**
 * Start watching database changes and auto-syncing
 */
export async function startAutoSync() {

  await storage.removeItem('sync:pending')
  
  if (isWatching) {
    console.log('[AUTO-SYNC] Already watching, skipping...')
    return () => {}
  }

  console.log('[AUTO-SYNC] Starting auto-sync manager...')
  isWatching = true

  // Initial network check
  await updateNetworkStatus()

  // Set up periodic network checks (every 10 seconds)
  const networkCheckInterval = setInterval(() => {
    updateNetworkStatus().catch(console.error)
  }, 10000)

  // Poll for database changes (check every 3 seconds)
  watchInterval = setInterval(async () => {
    try {
      // Skip change detection if no auth token (avoid spam)
      const hasToken = await hasAuthToken()
      if (!hasToken) {
        return // Don't check for changes if user isn't authenticated
      }

      const hasChanges = await hasUnsyncedChanges()
      if (hasChanges) {
        console.log('[AUTO-SYNC] Detected unsynced changes, triggering sync...')
        triggerSyncDebounced()
      }
    } catch (error) {
      console.error('[AUTO-SYNC] Error checking for changes:', error)
    }
  }, 3000) // Check every 3 seconds

  // Periodic pull from server (even if no local changes)
  if (PERIODIC_PULL_INTERVAL_MS > 0) {
    console.log(`[AUTO-SYNC] Periodic pull enabled: every ${PERIODIC_PULL_INTERVAL_MS / 1000} seconds`)
    periodicPullInterval = setInterval(async () => {
      try {
        const hasToken = await hasAuthToken()
        if (!hasToken) {
          return // Don't pull if user isn't authenticated
        }

        await updateNetworkStatus()
        if (!isOnline) {
          console.log('[AUTO-SYNC] Periodic pull skipped (offline)')
          return
        }

        // Check if sync is already in progress
        const pendingSync = await storage.getItem(PENDING_SYNC_KEY)
        if (pendingSync) {
          console.log('[AUTO-SYNC] Periodic pull skipped (sync in progress)')
          return
        }

        console.log('⏰ [AUTO-SYNC] Periodic pull triggered (every 10 seconds)')
        await triggerSync()
      } catch (error) {
        console.error('[AUTO-SYNC] Periodic pull error:', error)
      }
    }, PERIODIC_PULL_INTERVAL_MS)
  } else {
    console.log('[AUTO-SYNC] Periodic pull disabled (only syncs when local changes detected)')
  }

  // Process any queued syncs if online
  if (isOnline) {
    await processSyncQueue().catch(console.error)
  }

  // Cleanup function
  return () => {
    console.log('[AUTO-SYNC] Stopping auto-sync manager...')
    isWatching = false
    clearInterval(networkCheckInterval)
    if (watchInterval) {
      clearInterval(watchInterval)
      watchInterval = null
    }
    if (periodicPullInterval) {
      clearInterval(periodicPullInterval)
      periodicPullInterval = null
    }
    if (syncTimeout) {
      clearTimeout(syncTimeout)
    }
  }
}

/**
 * Stop watching database changes
 */
export function stopAutoSync() {
  if (!isWatching) return

  isWatching = false
  
  if (watchInterval) {
    clearInterval(watchInterval)
    watchInterval = null
  }
  
  if (periodicPullInterval) {
    clearInterval(periodicPullInterval)
    periodicPullInterval = null
  }
  
  if (syncTimeout) {
    clearTimeout(syncTimeout)
  }
}

/**
 * Manually trigger sync (bypasses debounce)
 */
export async function manualSync(): Promise<{ success: boolean; error?: string }> {
  await updateNetworkStatus()
  return syncDatabase()
}

/**
 * Get sync queue status
 */
export async function getSyncQueueStatus(): Promise<{ queued: number; isOnline: boolean }> {
  const queue = await getSyncQueue()
  return {
    queued: queue.length,
    isOnline: isOnline,
  }
}

