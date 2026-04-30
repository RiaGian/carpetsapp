// app/_layout.tsx
import { DatabaseProvider } from '@nozbe/watermelondb/react'
import { Stack } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { database, initializeDatabase } from '../src/database/initializeDatabase'
import { seedUsers } from '../src/services/users'
import { AuthProvider } from '../src/state/AuthProvider'
import { PreviewProvider } from '../src/state/PreviewProvider'

export default function RootLayout() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Initialize the local database
        await initializeDatabase()

        if (cancelled) return

        // Seed initial users ("system" + "admin@example.com") if not exist
        await seedUsers()
      } catch (err) {
        console.error('Boot error:', err)
      } finally {
        // Allow the app to render after setup
        if (!cancelled) setReady(true)
      }
    })()

    return () => {
      cancelled = true
    }
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
      {/* Wrap the whole app with AuthProvider to enable global login state */}
      <AuthProvider>
        <PreviewProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </PreviewProvider>
      </AuthProvider>
    </DatabaseProvider>
  )
}
