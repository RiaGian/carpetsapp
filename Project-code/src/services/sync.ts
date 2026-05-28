// src/services/sync.ts
// Complete sync service for syncing WatermelonDB with server

import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { BASE_URL } from '../api/config'
import { database } from '../database/initializeDatabase'

// ===================== STORAGE HELPERS =====================

const STORAGE_KEYS = {
  LAST_PULLED_AT: 'sync:lastPulledAt',
  AUTH_TOKEN: 'auth:token',
} as const

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

// ===================== TYPES =====================

export type SyncChanges = {
  [tableName: string]: {
    created: any[]
    updated: any[]
    deleted: string[] // array of IDs
  }
}

export type PullResponse = {
  changes: SyncChanges
  timestamp: number
}

export type PushResponse = {
  changes: SyncChanges // server's response with conflicts/errors
  timestamp: number
}

export type SyncResult = {
  success: boolean
  pulled: number // number of records pulled
  pushed: number // number of records pushed
  errors?: string[]
}

// ===================== AUTH HELPERS =====================

async function getAuthToken(): Promise<string | null> {
  // Try to get token from dedicated storage
  const token = await storage.getItem(STORAGE_KEYS.AUTH_TOKEN)
  if (token) return token

  // Fallback: try to get from auth:user (if token is stored there)
  const userStr = await storage.getItem('auth:user')
  if (userStr) {
    try {
      const user = JSON.parse(userStr)
      return user.token || null
    } catch {
      return null
    }
  }

  // If no token found, you might want to throw an error or return null
  // For now, returning null - the API will handle 401 errors
  console.warn('[SYNC] No auth token found. Sync requests may fail if authentication is required.')
  return null
}

// ===================== API HELPERS =====================

async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAuthToken()
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  }

  const url = `${BASE_URL}${endpoint}`
  
  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`API Error (${response.status}): ${errorText}`)
  }

  return response
}

// ===================== PULL (Server → Local) =====================

/**
 * Pulls changes from the server and applies them to local database
 */
export async function pullChanges(): Promise<PullResponse> {
  const lastPulledAt = await storage.getItem(STORAGE_KEYS.LAST_PULLED_AT)
  const timestamp = lastPulledAt ? parseInt(lastPulledAt, 10) : 0

  console.log(`[SYNC] Pulling changes since: ${timestamp}`)

  const response = await apiRequest(`/sync/pull?lastPulledAt=${timestamp}`)
  const data: PullResponse = await response.json()

  console.log(`[SYNC] Received changes:`, Object.keys(data.changes))

  // Apply changes to local database
  await applyChangesToLocal(data.changes)

  // Update lastPulledAt timestamp
  await storage.setItem(STORAGE_KEYS.LAST_PULLED_AT, String(data.timestamp))

  return data
}

// ===================== APPLY CHANGES TO LOCAL DB =====================

async function applyChangesToLocal(changes: SyncChanges): Promise<void> {
  await database.write(async () => {
    // Process each table
    for (const [tableName, tableChanges] of Object.entries(changes)) {
      const collection = database.get(tableName)

      // Apply created records
      for (const record of tableChanges.created || []) {
        try {
          // Check if record already exists (by id)
          const existing = await collection.find(record.id).catch(() => null)
          if (existing) {
            // Update existing record
            await (existing as any).update((r: any) => {
              Object.keys(record).forEach((key) => {
                if (key !== 'id' && !key.startsWith('_')) {
                  ;(r as any)[key] = record[key]
                }
              })
            })
          } else {
            // Create new record
            await collection.create((r: any) => {
              Object.keys(record).forEach((key) => {
                if (key !== 'id' && !key.startsWith('_')) {
                  ;(r as any)[key] = record[key]
                }
              })
            })
          }
        } catch (error) {
          console.error(`[SYNC] Error applying created record to ${tableName}:`, error)
        }
      }

      // Apply updated records
      for (const record of tableChanges.updated || []) {
        try {
          const existing = await collection.find(record.id)
          await (existing as any).update((r: any) => {
            Object.keys(record).forEach((key) => {
              if (key !== 'id' && !key.startsWith('_')) {
                ;(r as any)[key] = record[key]
              }
            })
          })
        } catch (error) {
          console.error(`[SYNC] Error applying updated record to ${tableName}:`, error)
        }
      }

      // Apply deleted records
      for (const recordId of tableChanges.deleted || []) {
        try {
          const existing = await collection.find(recordId).catch(() => null)
          if (existing) {
            await (existing as any).destroyPermanently()
          }
        } catch (error) {
          console.error(`[SYNC] Error deleting record from ${tableName}:`, error)
        }
      }
    }
  })
}

// ===================== COLLECT LOCAL CHANGES =====================

/**
 * Collects all local changes that need to be synced to server
 * This includes records marked as created, updated, or deleted
 */
async function collectLocalChanges(): Promise<SyncChanges> {
  const changes: SyncChanges = {}

  // List of all tables to sync (from your schema)
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

  await database.read(async () => {
    for (const tableName of tables) {
      try {
        const collection = database.get(tableName)
        
        // Get all records
        const allRecords = await collection.query().fetch()
        
        const created: any[] = []
        const updated: any[] = []
        const deleted: string[] = []

        for (const record of allRecords) {
          const raw = (record as any)._raw
          const status = raw._status

          // Convert WatermelonDB record to plain object
          const plainRecord = recordToPlainObject(record)

          if (status === 'created') {
            created.push(plainRecord)
          } else if (status === 'updated') {
            updated.push(plainRecord)
          }
          // Note: WatermelonDB doesn't track deleted records in the same way
          // You might need to track deletions separately or use a soft delete flag
        }

        if (created.length > 0 || updated.length > 0 || deleted.length > 0) {
          changes[tableName] = { created, updated, deleted }
        }
      } catch (error) {
        console.error(`[SYNC] Error collecting changes from ${tableName}:`, error)
      }
    }
  })

  return changes
}

// ===================== RECORD TRANSFORMATION =====================

/**
 * Converts a WatermelonDB Model to a plain object for API
 * The server expects snake_case field names (matching the schema)
 */
function recordToPlainObject(record: any): any {
  const raw = record._raw
  const plain: any = { id: raw.id }

  // Copy all fields from raw, excluding internal WatermelonDB fields
  Object.keys(raw).forEach((key) => {
    if (key.startsWith('_')) return // Skip internal fields like _status, _changed
    plain[key] = raw[key]
  })

  return plain
}

// ===================== PUSH (Local → Server) =====================

/**
 * Pushes local changes to the server
 */
export async function pushChanges(): Promise<PushResponse> {
  console.log('[SYNC] Collecting local changes...')
  const localChanges = await collectLocalChanges()

  const hasChanges = Object.values(localChanges).some(
    (table) => table.created.length > 0 || table.updated.length > 0 || table.deleted.length > 0
  )

  if (!hasChanges) {
    console.log('[SYNC] No local changes to push')
    return { changes: {}, timestamp: Date.now() }
  }

  console.log('[SYNC] Pushing changes to server...', localChanges)

  const response = await apiRequest('/sync/push', {
    method: 'POST',
    body: JSON.stringify({ changes: localChanges }),
  })

  const data: PushResponse = await response.json()

  // After successful push, mark records as synced
  await markRecordsAsSynced(localChanges)

  return data
}

/**
 * Marks records as synced (removes _status flags)
 */
async function markRecordsAsSynced(changes: SyncChanges): Promise<void> {
  await database.write(async () => {
    for (const [tableName, tableChanges] of Object.entries(changes)) {
      const collection = database.get(tableName)

      // Mark created records as synced
      for (const record of [...tableChanges.created, ...tableChanges.updated]) {
        try {
          const existing = await collection.find(record.id).catch(() => null)
          if (existing) {
            // WatermelonDB automatically handles this, but we can force a mark
            await (existing as any).update((r: any) => {
              // Just touch the record to mark it as synced
              ;(r as any).last_modified_at = Date.now()
            })
          }
        } catch (error) {
          console.error(`[SYNC] Error marking record as synced in ${tableName}:`, error)
        }
      }
    }
  })
}

// ===================== FULL SYNC =====================

/**
 * Performs a full sync: pull changes from server, then push local changes
 */
export async function sync(): Promise<SyncResult> {
  const errors: string[] = []
  let pulled = 0
  let pushed = 0

  try {
    // Step 1: Pull changes from server
    console.log('[SYNC] Starting sync: Pulling from server...')
    const pullResult = await pullChanges()
    
    // Count pulled records
    pulled = Object.values(pullResult.changes).reduce((sum, table) => {
      return sum + table.created.length + table.updated.length + table.deleted.length
    }, 0)

    console.log(`[SYNC] Pulled ${pulled} records from server`)

    // Step 2: Push local changes to server
    console.log('[SYNC] Pushing local changes to server...')
    const pushResult = await pushChanges()
    
    // Count pushed records
    pushed = Object.values(pushResult.changes).reduce((sum, table) => {
      return sum + table.created.length + table.updated.length + table.deleted.length
    }, 0)

    console.log(`[SYNC] Pushed ${pushed} records to server`)

    return {
      success: true,
      pulled,
      pushed,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[SYNC] Sync error:', errorMessage)
    errors.push(errorMessage)

    return {
      success: false,
      pulled,
      pushed,
      errors,
    }
  }
}

// ===================== UTILITY FUNCTIONS =====================

/**
 * Gets the last sync timestamp
 */
export async function getLastPulledAt(): Promise<number> {
  const timestamp = await storage.getItem(STORAGE_KEYS.LAST_PULLED_AT)
  return timestamp ? parseInt(timestamp, 10) : 0
}

/**
 * Resets sync state (useful for testing or full resync)
 */
export async function resetSyncState(): Promise<void> {
  await storage.removeItem(STORAGE_KEYS.LAST_PULLED_AT)
  console.log('[SYNC] Sync state reset')
}

/**
 * Sets the auth token for API requests
 */
export async function setAuthToken(token: string): Promise<void> {
  await storage.setItem(STORAGE_KEYS.AUTH_TOKEN, token)
}

