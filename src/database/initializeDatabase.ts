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

const adapter = new SQLiteAdapter({
  schema,
  dbName: 'localdb',
  jsi: true,
  onSetUpError: (error) => {
    console.error('WatermelonDB setup error (generic):', error)
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
  console.log('WatermelonDB initialized (generic).')
  return database
}
