// src/database/initializeDatabase.web.ts
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

// 🔍 Logs + πρόσβαση από browser console
const adapterAny = (database as any).adapter
console.log('WM adapter wrapper  →', adapterAny?.constructor?.name)
console.log('WM underlying adapter →', adapterAny?._underlyingAdapter?.constructor?.name || adapterAny?.adapter?.constructor?.name)
;(globalThis as any).db = database

// === Dev helpers για web console ===
const collections = [
  'users',
  'customers',
  'customer_phones',
  'customer_addresses',
  'orders',
  'order_items',
  'shelves',
  'warehouse_items',
  'activity_logs',
]

// dump όλων των πινάκων με counts + table view
;(globalThis as any).dump = async () => {
  const out: Record<string, any[]> = {}
  for (const name of collections) {
    try {
      const rows = await database.get<any>(name).query().fetch()
      const raw = rows.map(r => (r as any)._raw ?? r)
      out[name] = raw
      console.log(`📦 ${name}: ${rows.length} rows`)
      if (raw.length) console.table(raw)
    } catch (err) {
      console.warn(`⚠️ Δεν βρέθηκε συλλογή "${name}" ή απέτυχε το fetch`, err)
    }
  }
  return out
}

// helper για μία συλλογή
;(globalThis as any).all = async (name: string) => {
  const rows = await database.get<any>(name).query().fetch()
  const raw = rows.map(r => (r as any)._raw ?? r)
  console.log(`${name}: ${rows.length}`)
  if (raw.length) console.table(raw)
  return rows
}


export async function initializeDatabase() {
  console.log('WatermelonDB (web/Loki) initialized.')
  return database
}

export async function resetDbWeb() {
  await database.unsafeResetDatabase()
  console.log('DB reset (web) completed.')
}
