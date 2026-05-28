// src/database/syncAdapter.ts
// WatermelonDB Sync Adapter for syncing with server

import { SyncPullResult, SyncPushResult } from '@nozbe/watermelondb/sync'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { API_URL } from '../../config/api'
import { database } from './initializeDatabase'

// Storage helper for cross-platform
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
}

const LAST_PULLED_AT_KEY = 'sync:lastPulledAt'
const AUTH_TOKEN_KEY = 'auth:token'

/**
 * Get authentication token for API requests
 */
async function getAuthToken(): Promise<string | null> {
  const token = await storage.getItem(AUTH_TOKEN_KEY)
  if (token) return token

  // Fallback: try to get from auth:user
  const userStr = await storage.getItem('auth:user')
  if (userStr) {
    try {
      const user = JSON.parse(userStr)
      return user.token || null
    } catch {
      return null
    }
  }

  return null
}

/**
 * WatermelonDB Sync Adapter
 * Implements the sync interface required by WatermelonDB
 */
export async function pullChanges(
  lastPulledAt: number | null,
  schemaVersion: number,
  migration: any
): Promise<SyncPullResult> {
  const token = await getAuthToken()
  
  // Check stored sync state - if it's 0, force full sync
  const storedLastPulledAt = await getLastPulledAt()
  const isForceFullSync = storedLastPulledAt === 0
  
  // Check if we need a full sync (empty or very few customers locally)
  let shouldForceFullSync = false
  try {
    const customers = database.get('customers')
    const customerCount = await customers.query().fetchCount()
    if (customerCount === 0 || customerCount < 2) {
      shouldForceFullSync = true
    }
  } catch (error) {
    // Silently proceed with normal sync
  }
  
  // Force full sync if:
  // 1. Stored state is 0 (explicitly reset)
  // 2. Local DB is empty
  // 3. lastPulledAt is null (first sync)
  const lastPulledTimestamp = isForceFullSync || shouldForceFullSync || !lastPulledAt ? 0 : lastPulledAt

  const url = `${API_URL}/sync/pull`
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  } else {
    throw new Error('No authentication token available')
  }

  try {
    const requestBody = {
      lastPulledAt: lastPulledTimestamp,
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      let errorText = ''
      try {
        errorText = await response.text()
      } catch (e) {
        errorText = 'Could not read error response'
      }
      
      // Try to parse as JSON for better error display
      let errorJson: any = null
      try {
        errorJson = JSON.parse(errorText)
      } catch {
        // Not JSON, use as-is
      }
      
      console.error('[SYNC] Pull error details:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        errorJson: errorJson,
        url,
      })
      
      throw new Error(`Pull failed (${response.status}): ${errorJson?.error || errorJson?.message || errorText}`)
    }

    const data = await response.json()

    // Transform server response to WatermelonDB format
    const changes: Record<string, { created: any[]; updated: any[]; deleted: string[] }> = {}
    
    if (data.changes) {
      for (const [tableName, tableChanges] of Object.entries(data.changes)) {
        // Handle two possible server response formats:
        // 1. Array format: { "customers": [...] } - treat all as "created"
        // 2. Object format: { "customers": { "created": [...], "updated": [...], "deleted": [...] } }
        let tableData: { created?: any[]; updated?: any[]; deleted?: string[] }
        
        if (Array.isArray(tableChanges)) {
          // Server returned flat array - treat all as "created" records
          tableData = {
            created: tableChanges as any[],
            updated: [],
            deleted: [],
          }
        } else {
          // Server returned object with created/updated/deleted
          tableData = tableChanges as { created?: any[]; updated?: any[]; deleted?: string[] }
        }
        
        // Validate and clean records for WatermelonDB
        // WatermelonDB requires each record to have an 'id' field and required schema fields
        // Also converts string numbers to actual numbers (server might return strings)
        const validateRecord = (record: any, recordType: 'created' | 'updated'): any => {
          if (!record || typeof record !== 'object') {
            return null
          }
          if (!record.id) {
            return null
          }
          
          // Convert string numbers to actual numbers for WatermelonDB
          // Server might return timestamps as strings, but schema expects numbers
          const cleanedRecord = { ...record }
          
          if (tableName === 'customers') {
            // Convert timestamp fields from string to number
            if (typeof cleanedRecord.created_at === 'string') {
              cleanedRecord.created_at = parseInt(cleanedRecord.created_at, 10)
            }
            if (typeof cleanedRecord.last_modified_at === 'string') {
              cleanedRecord.last_modified_at = parseInt(cleanedRecord.last_modified_at, 10)
            }
          }
          
          return cleanedRecord
        }
        
        const validatedCreated = (tableData.created || [])
          .map(record => validateRecord(record, 'created'))
          .filter(record => record !== null)
        
        const validatedUpdated = (tableData.updated || [])
          .map(record => validateRecord(record, 'updated'))
          .filter(record => record !== null)
        
        changes[tableName] = {
          created: validatedCreated,
          updated: validatedUpdated,
          deleted: tableData.deleted || [],
        }
        
      }
    }

    const timestamp = data.timestamp || Date.now()
    await storage.setItem(LAST_PULLED_AT_KEY, String(timestamp))

    return {
      changes,
      timestamp,
    }
  } catch (error) {
    console.error('[SYNC] Pull error:', error)
    throw error
  }
}

/**
 * Clean WatermelonDB internal fields from data before sending to server
 * WatermelonDB already passes snake_case field names (because of @field decorators)
 * Server expects BIGINT (numbers) for created_at and last_modified_at, not ISO strings
 */
function cleanWatermelonFields(obj: any, tableName: string = ''): any {
  if (Array.isArray(obj)) {
    return obj.map(item => cleanWatermelonFields(item, tableName))
  }
  if (obj && typeof obj === 'object') {
    const cleaned: any = {}
    for (const [key, value] of Object.entries(obj)) {
      // Skip WatermelonDB internal fields
      if (key.startsWith('_')) {
        continue
      }
      // Keep timestamps as numbers (BIGINT) - server expects numbers, not ISO strings
      // WatermelonDB already uses snake_case field names (from @field decorators)
      cleaned[key] = cleanWatermelonFields(value, tableName)
    }
    return cleaned
  }
  return obj
}

/**
 * Push local changes to server
 */
export async function pushChanges(
  changes: Record<string, { created: any[]; updated: any[]; deleted: string[] }>,
  lastPulledAt: number
): Promise<SyncPushResult> {
  const token = await getAuthToken()

  const url = `${API_URL}/sync/push`

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  } else {
    throw new Error('No authentication token available')
  }

  try {
    // DEBUG: Log what WatermelonDB is passing
    console.log('[SYNC-DEBUG] 🔍 pushChanges received:', {
      tables: Object.keys(changes),
      customers: changes.customers ? {
        created: changes.customers.created?.length || 0,
        updated: changes.customers.updated?.length || 0,
        deleted: changes.customers.deleted?.length || 0,
        deletedIds: changes.customers.deleted || [],
      } : null,
    })
    
    // ONLY sync customers table for now - skip all others
    const cleanedChanges: Record<string, { created: any[]; updated: any[]; deleted: string[] }> = {}
    for (const [tableName, tableChanges] of Object.entries(changes)) {
      // ONLY process customers table
      if (tableName !== 'customers') {
        continue
      }
      
      cleanedChanges[tableName] = {
        created: cleanWatermelonFields(tableChanges.created || [], tableName),
        updated: cleanWatermelonFields(tableChanges.updated || [], tableName),
        deleted: tableChanges.deleted || [],
      }
    }
    
    // DEBUG: Log what we're sending to server
    console.log('[SYNC-DEBUG] 📤 Sending to server:', {
      customers: cleanedChanges.customers ? {
        created: cleanedChanges.customers.created?.length || 0,
        updated: cleanedChanges.customers.updated?.length || 0,
        deleted: cleanedChanges.customers.deleted?.length || 0,
        deletedIds: cleanedChanges.customers.deleted || [],
      } : null,
    })
    
    const requestBody = { changes: cleanedChanges }
    const requestBodyString = JSON.stringify(requestBody)
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: requestBodyString,
    })

    if (!response.ok) {
      let errorText = ''
      try {
        errorText = await response.text()
      } catch (e) {
        errorText = 'Could not read error response'
      }
      
      // Try to parse as JSON for better error display
      let errorJson: any = null
      try {
        errorJson = JSON.parse(errorText)
      } catch {
        // Not JSON, use as-is
      }
      
      throw new Error(`Push failed (${response.status}): ${errorJson?.message || errorJson?.error || errorText}`)
    }

    const data = await response.json()

    // DEBUG: Log server response
    console.log('[SYNC-DEBUG] 📥 Server response:', {
      status: response.status,
      customers: data.changes?.customers ? {
        created: data.changes.customers.created?.length || 0,
        updated: data.changes.customers.updated?.length || 0,
        deleted: data.changes.customers.deleted?.length || 0,
        deletedIds: data.changes.customers.deleted || [],
      } : null,
    })

    // Transform server response
    const serverChanges: Record<string, { created: any[]; updated: any[]; deleted: string[] }> = {}
    
    if (data.changes) {
      for (const [tableName, tableChanges] of Object.entries(data.changes)) {
        const tableData = tableChanges as { created?: any[]; updated?: any[]; deleted?: string[] }
        serverChanges[tableName] = {
          created: tableData.created || [],
          updated: tableData.updated || [],
          deleted: tableData.deleted || [],
        }
      }
    }

    const timestamp = data.timestamp || Date.now()

    return {
      experimentalRejectedIds: undefined,
    }
  } catch (error) {
    console.error('[SYNC] Push error:', error)
    throw error
  }
}

/**
 * Get the last pulled timestamp
 */
export async function getLastPulledAt(): Promise<number | null> {
  const timestamp = await storage.getItem(LAST_PULLED_AT_KEY)
  return timestamp ? parseInt(timestamp, 10) : null
}

/**
 * Set authentication token
 */
export async function setAuthToken(token: string): Promise<void> {
  await storage.setItem(AUTH_TOKEN_KEY, token)
}

/**
 * Reset sync state - forces a full sync on next pull
 * This will make the next sync pull ALL records from the server
 */
export async function resetSyncState(): Promise<void> {
  await storage.setItem(LAST_PULLED_AT_KEY, '0')
  console.log('[SYNC] Sync state reset - next sync will be a full sync')
}

