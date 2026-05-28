# 🔄 Auto-Sync Guide

This guide explains the **automatic sync system** that syncs your local database with the server whenever you make changes, even when offline!

## 🎯 Features

✅ **Automatic Sync**: Syncs automatically when you make changes to local DB  
✅ **Offline Support**: Queues syncs when offline, syncs when back online  
✅ **Network Detection**: Automatically detects network connectivity  
✅ **Debounced**: Waits 2 seconds after last change before syncing (prevents spam)  
✅ **Smart Queueing**: Only queues one sync per 5 seconds (prevents duplicates)

## 🚀 How It Works

### 1. **Automatic Detection**

The system automatically:
- Watches for database changes every 3 seconds
- Detects when records are created or updated
- Triggers sync automatically

### 2. **Network Handling**

- **Online**: Syncs immediately (after 2 second debounce)
- **Offline**: Queues the sync for later
- **Back Online**: Automatically processes queued syncs

### 3. **Integration**

The auto-sync manager starts automatically when your app initializes (in `app/_layout.tsx`).

## 📱 Usage

### Automatic (No Code Needed!)

The auto-sync runs automatically. Just use your database normally:

```typescript
// Create a customer - auto-sync will trigger after 2 seconds
await createCustomer(data)

// Update an order - auto-sync will trigger after 2 seconds
await updateOrder(orderId, updates)
```

### Check Sync Status

```typescript
import { useAutoSync } from './src/hooks/useAutoSync'

function MyComponent() {
  const { isOnline, queuedSyncs, isSyncing } = useAutoSync()

  return (
    <View>
      {!isOnline && <Text>Offline - {queuedSyncs} syncs queued</Text>}
      {isSyncing && <Text>Syncing...</Text>}
    </View>
  )
}
```

### Show Status Component

```typescript
import AutoSyncStatus from './src/components/AutoSyncStatus'

function MyScreen() {
  return (
    <View>
      <AutoSyncStatus />
      {/* Your content */}
    </View>
  )
}
```

### Manual Sync

If you need to force a sync immediately:

```typescript
import { manualSync } from './src/services/autoSyncManager'

const result = await manualSync()
if (result.success) {
  console.log('Sync successful!')
}
```

## 🔧 Configuration

### Debounce Time

Change how long to wait after changes before syncing:

```typescript
// In autoSyncManager.ts
const SYNC_DEBOUNCE_MS = 2000 // Change this (milliseconds)
```

### Polling Interval

Change how often to check for changes:

```typescript
// In autoSyncManager.ts
watchInterval = setInterval(async () => {
  // Check every 3 seconds (change this)
}, 3000)
```

### Network Check Interval

Change how often to check network status:

```typescript
// In autoSyncManager.ts
const networkCheckInterval = setInterval(() => {
  // Check every 10 seconds (change this)
}, 10000)
```

## 🐛 Troubleshooting

### Sync Not Triggering

1. **Check if auto-sync is running**: Look for `[AUTO-SYNC] Starting auto-sync manager...` in console
2. **Check network**: Make sure you're online
3. **Check for changes**: Verify records have `_status === 'created'` or `'updated'`

### Too Many Syncs

- Increase `SYNC_DEBOUNCE_MS` to wait longer after changes
- Increase polling interval to check less frequently

### Offline Syncs Not Processing

- Check network status: `getNetworkStatus()`
- Check queue: `getSyncQueueStatus()`
- Manually trigger: `manualSync()`

## 📊 Status Indicators

The `AutoSyncStatus` component shows:
- 🟠 **Offline**: No internet connection
- 🔵 **Syncing...**: Currently syncing
- ⚪ **X pending**: Queued syncs waiting

## 🎯 Best Practices

1. **Let it run automatically**: Don't manually sync unless necessary
2. **Show status to users**: Use `AutoSyncStatus` component
3. **Handle errors gracefully**: The system handles retries automatically
4. **Monitor queue**: Check `queuedSyncs` to see if syncs are backing up

## 🔍 Debugging

Enable detailed logging by checking console for:
- `[AUTO-SYNC]` - Auto-sync manager logs
- `[SYNC]` - Sync operation logs

## 📝 Notes

- Syncs are debounced: waits 2 seconds after last change
- Queue prevents duplicates: only one sync queued per 5 seconds
- Network checks every 10 seconds
- Database polling every 3 seconds
- All syncs use WatermelonDB's built-in sync system

## 🎉 That's It!

Your app now automatically syncs whenever you make changes to the database, even when offline! The syncs will happen automatically when you get back online.

