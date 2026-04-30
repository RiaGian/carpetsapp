import { Database } from '@nozbe/watermelondb'
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs'
import { schema } from './schema'

// Models
import ActivityLog from './models/ActivityLog'
import Customer from './models/Customer'
import CustomerAddress from './models/CustomerAddress'
import CustomerPhone from './models/CustomerPhone'
import Order from './models/Order'
import OrderItem from './models/OrderItem'
import Shelf from './models/Shelf'
import User from './models/Users'
import WarehouseItem from './models/WarehouseItem'


const adapter = new LokiJSAdapter({
  schema,
  dbName: 'carpets-dev',          
  useWebWorker: false,            
  useIncrementalIndexedDB: true,
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
  ],
})

// Προαιρετικό: helper για dev reset στο Web
export async function resetDbWeb() {
  await database.unsafeResetDatabase()
  // window.location.reload() //  auto-refresh μετά το reset
}

export async function initializeDatabase() {
  console.log('WatermelonDB (web/Loki) initialized.')
  return database
}
