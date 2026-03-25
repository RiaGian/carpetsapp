// database/initializeDatabase.native.ts
import { Database } from '@nozbe/watermelondb'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'
import { schema } from './schema'

// Models
import ActivityLog from './models/ActivityLog'
import Customer from './models/Customer'
import CustomerAddress from './models/CustomerAddress'
import CustomerPhone from './models/CustomerPhone'
import Order from './models/Order'
import OrderItem from './models/OrderItem'
import Pickup from './models/Pickup'
import Shelf from './models/Shelf'
import User from './models/Users'
import WarehouseItem from './models/WarehouseItem'
// import { migrations } from './migrations/schemaMigrations'

const adapter = new SQLiteAdapter({
  schema,
  dbName: 'localdb',
  jsi: true,
  // migrations,
  onSetUpError: (e) => {
    console.error('WatermelonDB setup error (native):', e)
  },
})

export const database = new Database({
  adapter,
  modelClasses: [
    User,
    ActivityLog,
    Customer,
    CustomerPhone,
    CustomerAddress,
    Order,
    OrderItem,
    Shelf,
    WarehouseItem,
    Pickup,
  ],
})

export async function initializeDatabase() {
  console.log('WatermelonDB (native/SQLite) initialized.')
  return database
}
