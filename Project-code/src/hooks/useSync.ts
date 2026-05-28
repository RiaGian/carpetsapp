// src/hooks/useSync.ts
// React hook for syncing with server

import { useCallback, useState } from 'react'
import { getLastPulledAt, pullChanges, pushChanges, sync, SyncResult } from '../services/sync'

export type SyncStatus = 'idle' | 'pulling' | 'pushing' | 'syncing' | 'success' | 'error'

export function useSync() {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [lastSync, setLastSync] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)

  // Load last sync time on mount
  const loadLastSync = useCallback(async () => {
    const timestamp = await getLastPulledAt()
    setLastSync(timestamp)
  }, [])

  // Full sync (pull + push)
  const performSync = useCallback(async (): Promise<SyncResult> => {
    setStatus('syncing')
    setError(null)

    try {
      const syncResult = await sync()
      
      if (syncResult.success) {
        setStatus('success')
        setResult(syncResult)
        await loadLastSync() // Refresh last sync time
      } else {
        setStatus('error')
        setError(syncResult.errors?.join(', ') || 'Sync failed')
        setResult(syncResult)
      }

      return syncResult
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setStatus('error')
      setError(errorMessage)
      return {
        success: false,
        pulled: 0,
        pushed: 0,
        errors: [errorMessage],
      }
    }
  }, [loadLastSync])

  // Pull only
  const pull = useCallback(async () => {
    setStatus('pulling')
    setError(null)

    try {
      await pullChanges()
      setStatus('success')
      await loadLastSync()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setStatus('error')
      setError(errorMessage)
      throw err
    }
  }, [loadLastSync])

  // Push only
  const push = useCallback(async () => {
    setStatus('pushing')
    setError(null)

    try {
      await pushChanges()
      setStatus('success')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setStatus('error')
      setError(errorMessage)
      throw err
    }
  }, [])

  // Reset status
  const reset = useCallback(() => {
    setStatus('idle')
    setError(null)
    setResult(null)
  }, [])

  return {
    status,
    lastSync,
    error,
    result,
    sync: performSync,
    pull,
    push,
    reset,
    loadLastSync,
  }
}

