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
import Pickup from './models/Pickup'
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
    Pickup,
  ],
})

// 🔍 Logs + πρόσβαση από browser console
const adapterAny = (database as any).adapter
// console.log('WM adapter wrapper  →', adapterAny?.constructor?.name)
// console.log('WM underlying adapter →', adapterAny?._underlyingAdapter?.constructor?.name || adapterAny?.adapter?.constructor?.name)
;(globalThis as any).db = database
;(globalThis as any).database = database

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
  'pickups',
]

// dump όλων των πινάκων με counts + table view
;(globalThis as any).dump = async () => {
  const out: Record<string, any[]> = {}
  for (const name of collections) {
    try {
      const collection = database.get<any>(name)
      if (!collection) {
        console.warn(`⚠️ Συλλογή "${name}" δεν υπάρχει`)
        out[name] = []
        continue
      }
      const rows = await collection.query().fetch()
      const raw = rows.map(r => (r as any)._raw ?? r)
      out[name] = raw
      // console.log(`📦 ${name}: ${rows.length} rows`)
      if (raw.length) console.table(raw)
    } catch (err) {
      console.warn(`⚠️ Δεν βρέθηκε συλλογή "${name}" ή απέτυχε το fetch`, err)
      out[name] = []
    }
  }
  return out
}

// helper για μία συλλογή
;(globalThis as any).all = async (name: string) => {
  try {
    const collection = database.get<any>(name)
    if (!collection) {
      console.warn(`⚠️ Συλλογή "${name}" δεν υπάρχει`)
      return []
    }
    const rows = await collection.query().fetch()
    const raw = rows.map(r => (r as any)._raw ?? r)
    // console.log(`${name}: ${rows.length}`)
    if (raw.length) console.table(raw)
    return rows
  } catch (err) {
    console.warn(`⚠️ Σφάλμα κατά την ανάκτηση "${name}":`, err)
    return []
  }
}


export async function initializeDatabase() {
  console.log('WatermelonDBB (web/Loki) initialized.')
  return database
}

export async function resetDbWeb() {
  await database.write(async () => {
    await database.unsafeResetDatabase()
  })
  console.log('DB reset (web) completed.')
}

// Expose resetDbWeb to browser console
;(globalThis as any).resetDb = resetDbWeb
;(globalThis as any).resetDbWeb = resetDbWeb
