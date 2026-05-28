// src/hooks/useWatermelonSync.ts
// React hook for WatermelonDB sync

import { useCallback, useEffect, useState } from 'react'
import { getLastPulledAt } from '../database/syncAdapter'
import { syncDatabase } from '../services/syncWatermelon'

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

export function useWatermelonSync() {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [lastSync, setLastSync] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load last sync time on mount
  const loadLastSync = useCallback(async () => {
    const timestamp = await getLastPulledAt()
    setLastSync(timestamp)
  }, [])

  useEffect(() => {
    loadLastSync()
  }, [loadLastSync])

  // Sync function
  const sync = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    setStatus('syncing')
    setError(null)

    try {
      const result = await syncDatabase()
      
      if (result.success) {
        setStatus('success')
        await loadLastSync() // Refresh last sync time
      } else {
        setStatus('error')
        setError(result.error || 'Sync failed')
      }

      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setStatus('error')
      setError(errorMessage)
      return {
        success: false,
        error: errorMessage,
      }
    }
  }, [loadLastSync])

  // Reset status
  const reset = useCallback(() => {
    setStatus('idle')
    setError(null)
  }, [])

  return {
    status,
    lastSync,
    error,
    sync,
    reset,
    loadLastSync,
  }
}

