# 🔄 Sync System Guide

This guide explains how to sync your local WatermelonDB database with your server.

## 📋 Overview

The sync system allows you to:
- **Pull** changes from the server to your local database
- **Push** local changes to the server
- Keep track of the last sync timestamp
- Handle conflicts and errors gracefully

## 🚀 Quick Start

### 1. Basic Usage

```typescript
import { sync } from './src/services/sync'

// Perform a full sync (pull + push)
const result = await sync()

if (result.success) {
  console.log(`Pulled ${result.pulled} records`)
  console.log(`Pushed ${result.pushed} records`)
} else {
  console.error('Sync failed:', result.errors)
}
```

### 2. Using the React Hook

```typescript
import { useSync } from './src/hooks/useSync'

function MyComponent() {
  const { status, lastSync, error, sync } = useSync()

  const handleSync = async () => {
    const result = await sync()
    // Handle result...
  }

  return (
    <View>
      <Button onPress={handleSync} title="Sync Now" />
      {status === 'syncing' && <Text>Syncing...</Text>}
      {error && <Text>Error: {error}</Text>}
    </View>
  )
}
```

### 3. Using the SyncButton Component

```typescript
import SyncButton from './src/components/SyncButton'

function MyScreen() {
  return (
    <View>
      <SyncButton />
    </View>
  )
}
```

## 📡 API Endpoints

Your server must implement these endpoints:

### GET `/api/sync/pull?lastPulledAt={timestamp}`

Returns changes since the last sync.

**Response:**
```json
{
  "changes": {
    "customers": {
      "created": [...],
      "updated": [...],
      "deleted": ["id1", "id2"]
    },
    "orders": {
      "created": [...],
      "updated": [...],
      "deleted": []
    }
  },
  "timestamp": 1234567890
}
```

### POST `/api/sync/push`

Receives local changes and applies them to the server.

**Request:**
```json
{
  "changes": {
    "customers": {
      "created": [...],
      "updated": [...],
      "deleted": ["id1"]
    }
  }
}
```

**Response:**
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

The sync service automatically includes the auth token in requests. Make sure to store the token:

```typescript
import { setAuthToken } from './src/services/sync'

// After successful login
await setAuthToken(token)
```

Or update your login flow to store the token:

```typescript
// In your login function
const response = await loginApi(email, password)
await setAuthToken(response.token)
```

## 📊 Supported Tables

The sync system handles all tables from your schema:
- `users`
- `customers`
- `customer_phones`
- `customer_addresses`
- `orders`
- `order_items`
- `shelves`
- `warehouse_items`
- `activity_logs`
- `pickups`
- `payments`

## 🔧 Advanced Usage

### Pull Only

```typescript
import { pullChanges } from './src/services/sync'

const result = await pullChanges()
console.log('Pulled changes:', result.changes)
```

### Push Only

```typescript
import { pushChanges } from './src/services/sync'

const result = await pushChanges()
console.log('Pushed changes:', result.changes)
```

### Get Last Sync Time

```typescript
import { getLastPulledAt } from './src/services/sync'

const timestamp = await getLastPulledAt()
console.log('Last synced:', new Date(timestamp))
```

### Reset Sync State

```typescript
import { resetSyncState } from './src/services/sync'

// This will force a full sync on next pull
await resetSyncState()
```

## 🐛 Troubleshooting

### No Token Found

If you see "No auth token found" warnings:
1. Make sure you're storing the token after login
2. Check that `setAuthToken()` is called with the correct token

### Sync Fails with 401

- Verify your token is valid
- Check that the token is being sent in the Authorization header
- Ensure your server accepts Bearer tokens

### Records Not Syncing

- Check that records have the correct `_status` flag (`created` or `updated`)
- Verify the field names match between local DB and server
- Check console logs for specific error messages

### Conflicts

If the same record is modified on both client and server:
- The server should handle conflicts in the `/sync/push` endpoint
- Consider implementing a "last write wins" or merge strategy

## 📝 Notes

- The sync system uses `lastPulledAt` timestamp to only fetch incremental changes
- Records are automatically marked as synced after successful push
- Deleted records are tracked separately (you may need to implement soft deletes)
- All sync operations are logged to the console for debugging

## 🎯 Best Practices

1. **Sync on App Start**: Pull changes when the app opens
2. **Sync After Changes**: Push changes after creating/updating records
3. **Periodic Sync**: Set up a background sync every few minutes
4. **Error Handling**: Always check `result.success` and handle errors
5. **User Feedback**: Show sync status to users (use the `SyncButton` component)

## 🔄 Sync Flow Diagram

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ 1. Pull changes
       ├─────────────────┐
       │                 │
       ▼                 ▼
┌─────────────┐    ┌─────────────┐
│   Server    │    │  Local DB   │
└─────────────┘    └─────────────┘
       │                 │
       │ 2. Apply changes│
       │    to local DB  │
       │                 │
       │ 3. Collect local│
       │    changes      │
       │                 │
       │ 4. Push changes │
       ├─────────────────┤
       │                 │
       ▼                 ▼
┌─────────────┐    ┌─────────────┐
│   Server    │    │  Local DB   │
└─────────────┘    └─────────────┘
```

## 📚 API Reference

See `src/services/sync.ts` for the complete API reference.

