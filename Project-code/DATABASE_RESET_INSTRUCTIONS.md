# Database Reset Instructions - Payments Table

## Problem
The `payments` table is not being created because WatermelonDB doesn't automatically create new tables when the schema version changes. The database needs to be reset to apply the new schema version 4.

## ⚠️ WARNING
**Resetting the database will DELETE ALL DATA** (customers, orders, items, etc.). Only do this in development!

## Solution: Reset Database

### For Web (Browser):
1. Open your browser's Developer Console (F12)
2. Run this command:
   ```javascript
   resetDbWeb()
   ```
3. The database will be reset and recreated with the new schema
4. Refresh the page

### For Native (React Native):
The database will be reset automatically when you:
1. Uninstall the app from your device/emulator
2. Reinstall it
3. Or clear app data manually

### Alternative: Check if table exists
You can check if the payments table exists by running in browser console:
```javascript
// Check if payments table exists
const payments = database.get('payments')
console.log('Payments table:', payments)

// Check all tables
dump()
```

## Why This Happens
- Schema version was updated from 3 → 4
- New `payments` table was added to schema
- Payment model was created and registered
- But existing database still has version 3 schema
- WatermelonDB doesn't auto-migrate new tables (only columns)

## After Reset
Once the database is reset:
1. The `payments` table will be created
2. New orders will create payment records automatically
3. Debt calculation will use the payments table
4. Old orders will still work (using fallback logic)

## Future: Proper Migrations
For production, you should implement proper WatermelonDB migrations instead of resetting. But for development, resetting is fine.

