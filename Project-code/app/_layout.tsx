import { DatabaseProvider } from '@nozbe/watermelondb/react'
import { Stack } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { database, initializeDatabase } from '../src/database/initializeDatabase'

// It initializes the local WatermelonDB database before rendering any screens.
export default function RootLayout() {

  // if ready to use the DB
  const [ready, setReady] = useState(false)

  useEffect(() => {
     // Initialize the WatermelonDB database when the app starts
    initializeDatabase().finally(() => setReady(true))
  }, [])

  if (!ready) {

    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    )
  }

  // When the database is ready, we wrap the whole app inside the DatabaseProvider
  // This lets every screen and component use the same WatermelonDB connection
  return (
    <DatabaseProvider database={database}>
      <Stack screenOptions={{ headerShown: false }} />
    </DatabaseProvider>
  )
}
