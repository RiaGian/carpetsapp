import { DatabaseProvider } from '@nozbe/watermelondb/react'
import { Stack } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { database, initializeDatabase } from '../src/database/initializeDatabase'

import { PreviewProvider } from '../src/state/PreviewProvider'

export default function RootLayout() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    initializeDatabase().finally(() => setReady(true))
  }, [])

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    )
  }

  return (
    <DatabaseProvider database={database}>
    
      <PreviewProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </PreviewProvider>
    </DatabaseProvider>
  )
}
