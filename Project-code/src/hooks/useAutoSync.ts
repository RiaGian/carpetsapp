// src/hooks/useAutoSync.ts
// React hook for auto-sync status and controls

import { useCallback, useEffect, useState } from 'react'
import { getNetworkStatus, getSyncQueueStatus, manualSync, onNetworkChange } from '../services/autoSyncManager'

export function useAutoSync() {
  const [isOnline, setIsOnline] = useState(getNetworkStatus())
  const [queuedSyncs, setQueuedSyncs] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)

  // Update network status
  useEffect(() => {
    const unsubscribe = onNetworkChange((online) => {
      setIsOnline(online)
    })

    // Initial status check
    const checkStatus = async () => {
      const status = await getSyncQueueStatus()
      setQueuedSyncs(status.queued)
    }
    checkStatus()

    // Periodic status updates
    const interval = setInterval(async () => {
      const status = await getSyncQueueStatus()
      setQueuedSyncs(status.queued)
    }, 5000) // Check every 5 seconds

    return () => {
      unsubscribe()
      clearInterval(interval)
    }
  }, [])

  // Manual sync function
  const sync = useCallback(async () => {
    setIsSyncing(true)
    try {
      const result = await manualSync()
      return result
    } finally {
      setIsSyncing(false)
    }
  }, [])

  return {
    isOnline,
    queuedSyncs,
    isSyncing,
    sync,
  }
}

