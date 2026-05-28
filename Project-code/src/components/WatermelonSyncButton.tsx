// src/components/WatermelonSyncButton.tsx
// Sync button component using WatermelonDB's built-in sync

import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { resetSyncState } from '../database/syncAdapter'
import { useWatermelonSync } from '../hooks/useWatermelonSync'
import { syncDatabase } from '../services/syncWatermelon'
import { colors } from '../theme/colors'

export default function WatermelonSyncButton() {
  const { status, lastSync, error, sync } = useWatermelonSync()

  const handleSync = async () => {
    try {
      const result = await sync()
      
      if (result.success) {
        Alert.alert('Sync Successful', 'Database synced successfully!', [{ text: 'OK' }])
      } else {
        Alert.alert('Sync Failed', result.error || 'Unknown error', [{ text: 'OK' }])
      }
    } catch (err) {
      Alert.alert('Sync Error', err instanceof Error ? err.message : String(err))
    }
  }

  const handleForceFullSync = async () => {
    try {
      Alert.alert(
        'Force Full Sync',
        'This will reset sync state and pull ALL records from server. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Yes, Force Sync',
            onPress: async () => {
              console.log('[SYNC] Force full sync triggered by user')
              await resetSyncState()
              const result = await syncDatabase()
              
              if (result.success) {
                Alert.alert('Full Sync Successful', 'All records pulled from server!', [{ text: 'OK' }])
              } else {
                Alert.alert('Full Sync Failed', result.error || 'Unknown error', [{ text: 'OK' }])
              }
            },
          },
        ]
      )
    } catch (err) {
      Alert.alert('Force Sync Error', err instanceof Error ? err.message : String(err))
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'idle':
        return 'Sync Now'
      case 'syncing':
        return 'Syncing...'
      case 'success':
        return 'Sync Complete'
      case 'error':
        return 'Sync Failed'
      default:
        return 'Sync'
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return '#4CAF50'
      case 'error':
        return '#F44336'
      default:
        return colors.primary || '#007AFF'
    }
  }

  const formatLastSync = () => {
    if (!lastSync) return 'Never synced'
    const date = new Date(lastSync)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} minutes ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours} hours ago`
    return date.toLocaleDateString()
  }

  const isLoading = status === 'syncing'

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: getStatusColor() }]}
        onPress={handleSync}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.buttonText}>{getStatusText()}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.forceSyncButton]}
        onPress={handleForceFullSync}
        disabled={isLoading}
      >
        <Text style={styles.forceSyncButtonText}>Force Full Sync</Text>
      </TouchableOpacity>

      <Text style={styles.lastSyncText}>Last sync: {formatLastSync()}</Text>

      {error && (
        <Text style={styles.errorText}>Error: {error}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    alignItems: 'center',
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  lastSyncText: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
  },
  errorText: {
    marginTop: 4,
    fontSize: 12,
    color: '#F44336',
  },
  forceSyncButton: {
    marginTop: 8,
    backgroundColor: '#FF9800',
  },
  forceSyncButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
})

