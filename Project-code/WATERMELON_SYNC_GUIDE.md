# 🍉 WatermelonDB Built-in Sync Guide

This guide explains how to use WatermelonDB's **built-in sync feature** to sync your local database with your server at `http://150.140.143.190:4001`.

## 🎯 Overview

WatermelonDB has a built-in synchronization system that automatically handles:
- ✅ Pulling changes from server
- ✅ Pushing local changes to server
- ✅ Conflict resolution
- ✅ Incremental sync (only syncs changes since last sync)
- ✅ Transaction management

## 🚀 Quick Start

### 1. Basic Usage

```typescript
import { syncDatabase } from './src/services/syncWatermelon'

// Sync your database
const result = await syncDatabase()

if (result.success) {
  console.log('Sync successful!')
} else {
  console.error('Sync failed:', result.error)
}
```

### 2. Using the React Hook

```typescript
import { useWatermelonSync } from './src/hooks/useWatermelonSync'

function MyComponent() {
  const { status, lastSync, error, sync } = useWatermelonSync()

  return (
    <View>
      <Button onPress={sync} title="Sync" />
      {status === 'syncing' && <Text>Syncing...</Text>}
      {error && <Text>Error: {error}</Text>}
      {lastSync && <Text>Last sync: {new Date(lastSync).toLocaleString()}</Text>}
    </View>
  )
}
```

### 3. Using the Sync Button Component

```typescript
import WatermelonSyncButton from './src/components/WatermelonSyncButton'

function MyScreen() {
  return (
    <View>
      <WatermelonSyncButton />
    </View>
  )
}
```

## 📡 Server Requirements

Your server at `http://150.140.143.190:4001` must implement these endpoints:

### GET `/sync/pull?lastPulledAt={timestamp}`

Returns changes since the last sync.

**Response Format:**
```json
{
  "changes": {
    "customers": {
      "created": [
        { "id": "abc123", "first_name": "John", "last_name": "Doe", ... }
      ],
      "updated": [
        { "id": "def456", "first_name": "Jane", ... }
      ],
      "deleted": ["ghi789"]
    },
    "orders": {
      "created": [],
      "updated": [],
      "deleted": []
    }
  },
  "timestamp": 1234567890
}
```

### POST `/sync/push`

Receives local changes and applies them to the server.

**Request Format:**
```json
{
  "changes": {
    "customers": {
      "created": [...],
      "updated": [...],
      "deleted": ["id1", "id2"]
    }
  }
}
```

**Response Format:**
```json
{
  "changes": {
    "customers": {
      "created": [...],
      "updated": [...],
      "deleted": []
    }
  },
  "timestamp": 1234567890
}
```

## 🔐 Authentication

The sync adapter automatically includes the auth token in requests. Store your token:

```typescript
import { setAuthToken } from './src/database/syncAdapter'

// After successful login
await setAuthToken(token)
```

Or update your login flow:

```typescript
import { loginApi } from './src/api/auth'
import { setAuthToken } from './src/database/syncAdapter'

const response = await loginApi(email, password)
await setAuthToken(response.token)
```

## 📊 How It Works

1. **Pull Changes**: Fetches changes from server since `lastPulledAt`
2. **Apply Changes**: WatermelonDB automatically applies changes to local DB
3. **Collect Local Changes**: Gathers all created/updated/deleted records
4. **Push Changes**: Sends local changes to server
5. **Update Timestamp**: Stores new `lastPulledAt` for next sync

## 🎯 Best Practices

### 1. Sync on App Start

```typescript
// In your app initialization
import { syncDatabase } from './src/services/syncWatermelon'

useEffect(() => {
  syncDatabase().catch(console.error)
}, [])
```

### 2. Sync After Creating/Updating Records

```typescript
// After creating a customer
await createCustomer(data)
await syncDatabase() // Sync immediately
```

### 3. Periodic Background Sync

```typescript
// Sync every 5 minutes
setInterval(() => {
  syncDatabase().catch(console.error)
}, 5 * 60 * 1000)
```

### 4. Manual Sync Button

Use the `WatermelonSyncButton` component for user-triggered syncs.

## 🔧 Advanced Usage

### Get Last Sync Time

```typescript
import { getLastPulledAt } from './src/database/syncAdapter'

const timestamp = await getLastPulledAt()
console.log('Last synced:', new Date(timestamp || 0))
```

### Reset Sync State

To force a full sync, you can clear the last pulled timestamp:

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage'

// Clear sync state (will sync everything on next pull)
await AsyncStorage.removeItem('sync:lastPulledAt')
```

## 🐛 Troubleshooting

### Sync Fails with 401

- Make sure you're storing the token: `await setAuthToken(token)`
- Verify the token is valid
- Check server authentication middleware

### Records Not Syncing

- Verify field names match between local DB and server
- Check that records have correct `_status` flags
- Look at console logs for specific errors

### Server Returns Wrong Format

The server must return:
- `changes` object with table names as keys
- Each table has `created`, `updated`, `deleted` arrays
- `timestamp` number

## 📝 Notes

- WatermelonDB automatically handles:
  - Transaction management
  - Conflict resolution (client wins per column)
  - Incremental sync
  - Record status tracking

- The sync adapter connects to: `http://150.140.143.190:4001`

- All sync operations are logged to console for debugging

## 🎉 That's It!

Your WatermelonDB database is now configured to sync with your server using the built-in sync feature. Just call `syncDatabase()` whenever you want to sync!

