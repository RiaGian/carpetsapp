// src/services/syncWatermelon.ts
// Helper service for triggering WatermelonDB sync using the synchronize function

import { synchronize } from '@nozbe/watermelondb/sync';
import { database } from '../database/initializeDatabase';
import { getLastPulledAt, pullChanges, pushChanges } from '../database/syncAdapter';

/**
 * Trigger WatermelonDB's built-in sync using the synchronize function
 * This uses the sync adapter we configured
 * 
 * WatermelonDB's synchronize automatically:
 * 1. Pulls changes from server (via pullChanges)
 * 2. Applies pulled changes to local DB (automatic)
 * 3. Pushes local changes to server (via pushChanges)
 * 4. Updates lastPulledAt timestamp
 */
export async function syncDatabase(): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[SYNC] Starting sync...')
    
    const lastPulledAt = await getLastPulledAt()

    await synchronize({
      database,
      pullChanges: async ({ lastPulledAt: timestamp, schemaVersion, migration }) => {
        return await pullChanges(timestamp ?? null, schemaVersion, migration)
      },
      pushChanges: async ({ changes, lastPulledAt: timestamp }) => {
        return await pushChanges(changes, timestamp)
      },
    })

    console.log('[SYNC] Sync completed successfully')
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[SYNC] Sync failed:', errorMessage)
    return { success: false, error: errorMessage }
  }
}

