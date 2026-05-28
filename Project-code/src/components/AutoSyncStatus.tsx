// src/components/AutoSyncStatus.tsx
// Component to show auto-sync status

import { StyleSheet, Text, View } from 'react-native'
import { useAutoSync } from '../hooks/useAutoSync'
import { colors } from '../theme/colors'

export default function AutoSyncStatus() {
  const { isOnline, queuedSyncs, isSyncing } = useAutoSync()

  if (!isOnline && queuedSyncs === 0 && !isSyncing) {
    return null // Don't show anything if everything is fine and online
  }

  return (
    <View style={styles.container}>
      {!isOnline && (
        <View style={[styles.badge, styles.offline]}>
          <Text style={styles.text}>Offline</Text>
          {queuedSyncs > 0 && (
            <Text style={styles.smallText}>{queuedSyncs} queued</Text>
          )}
        </View>
      )}
      
      {isSyncing && (
        <View style={[styles.badge, styles.syncing]}>
          <Text style={styles.text}>Syncing...</Text>
        </View>
      )}

      {isOnline && queuedSyncs > 0 && !isSyncing && (
        <View style={[styles.badge, styles.queued]}>
          <Text style={styles.text}>{queuedSyncs} pending</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    padding: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offline: {
    backgroundColor: '#FF9800',
  },
  syncing: {
    backgroundColor: colors.primary || '#007AFF',
  },
  queued: {
    backgroundColor: '#9E9E9E',
  },
  text: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  smallText: {
    color: '#FFF',
    fontSize: 10,
    marginTop: 2,
  },
})

