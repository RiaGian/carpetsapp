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
    console.log('[SYNC] Starting WatermelonDB sync...')
    
    // Get customer count BEFORE sync
    const customersBefore = database.get('customers')
    const countBefore = await customersBefore.query().fetchCount()
    console.log(`[SYNC] Customers before sync: ${countBefore}`)
    
    const lastPulledAt = await getLastPulledAt()
    console.log('[SYNC] Last pulled at:', lastPulledAt)

    // Use WatermelonDB's synchronize function
    // This automatically applies pulled changes to the local database
    await synchronize({
      database,
      pullChanges: async ({ lastPulledAt: timestamp, schemaVersion, migration }) => {
        console.log('[SYNC] WatermelonDB calling pullChanges...')
        const result = await pullChanges(timestamp ?? null, schemaVersion, migration)
        // Log result details (result is SyncPullResult which has changes and timestamp)
        const resultAny = result as any
        if (resultAny.changes) {
          const tables = Object.keys(resultAny.changes)
          const totalRecords = Object.values(resultAny.changes).reduce((sum: number, table: any) => 
            sum + (table.created?.length || 0) + (table.updated?.length || 0) + (table.deleted?.length || 0), 0
          )
          console.log('[SYNC] pullChanges returned:', {
            tables,
            totalRecords,
            timestamp: resultAny.timestamp,
          })
        }
        return result
      },
      pushChanges: async ({ changes, lastPulledAt: timestamp }) => {
        console.log('[SYNC] WatermelonDB calling pushChanges...')
        const result = await pushChanges(changes, timestamp)
        console.log('[SYNC] pushChanges completed')
        return result
      },
      // Don't enable migrations if database doesn't support them
      // migrationsEnabledAtVersion: schema.version,
    })

    // Verify records were inserted
    const countAfter = await customersBefore.query().fetchCount()
    console.log(`[SYNC] Customers after sync: ${countAfter} (was ${countBefore})`)
    
    if (countAfter > countBefore) {
      console.log(`[SYNC] ✅ Successfully inserted ${countAfter - countBefore} new customer(s)`)
    } else if (countAfter === countBefore) {
      console.log('[SYNC] ⚠️ No new customers inserted (might be updates only or no changes)')
    }

    console.log('[SYNC] WatermelonDB sync completed successfully')
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[SYNC] WatermelonDB sync failed:', errorMessage)
    console.error('[SYNC] Full error:', error)
    return { success: false, error: errorMessage }
  }
}

