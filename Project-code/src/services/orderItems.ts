
import { Q } from '@nozbe/watermelondb';
import { database } from '../database/initializeDatabase';
import { logAddOrderItem, logDeleteOrderItem, logUpdateOrderItem } from './activitylog'; //  logging

// check for duplicates
export async function existsItemCode(code: string) {
  const items = database.get('order_items');
  const c = String(code ?? '').trim().toUpperCase();
  if (!c) return false;
  const rows = await items.query(Q.where('item_code', c), Q.take(1)).fetch();
  return rows.length > 0;
}

// check for duplicates (already existed item)
export async function existsItemCodeExcept(id: string, code: string) {
  const items = database.get('order_items')
  const c = String(code ?? '').trim().toUpperCase()
  if (!c) return false
  const rows = await items
    .query(Q.where('item_code', c), Q.where('id', Q.notEq(id)), Q.take(1))
    .fetch()
  return rows.length > 0
}

export const normId = (v: any) => {
  const s = String(v ?? '').trim()
  if (!s) return ''
  return /^\d+$/.test(s) ? String(Number(s)) : s // "0012" -> "12"
}

export type NewOrderItem = {
  orderId: string           // FK -> orders.id
  item_code?: string
  category?: string
  color?: string
  price: number
  status: string
  storage_status?: string
  order_date?: string
  length_m?: string
  width_m?: string
  area_m2?: string
  price_per_m2?: string
  created_at?: number
}

export type UpdateOrderItem = Partial<NewOrderItem>

/**  CREATE  */
export async function createOrderItem(data: NewOrderItem, userIdForLog: string = 'system') {
  const items  = database.get('order_items')
  const orders = database.get('orders')

  let newRecord: any = null

  await database.write(async () => {
  const orderModel = await orders.find(data.orderId)

  const existingItems = await (orderModel as any).items.fetch()

    let finalOrderDate = data.order_date ?? new Date().toISOString().slice(0, 10)

    if (existingItems.length > 0) {

      const firstItem = existingItems[0]
      finalOrderDate = firstItem.order_date ?? finalOrderDate
    }


    newRecord = await items.create((rec: any) => {
      rec.order.set(orderModel)
      rec.item_code      = data.item_code ?? ''
      rec.category       = data.category ?? ''
      rec.color          = data.color ?? ''
      rec.price          = Number.isFinite(data.price) ? data.price : 0
      rec.status         = data.status ?? ''
      rec.storage_status = data.storage_status ?? ''
      rec.order_date     = finalOrderDate  // lock date
      rec.length_m       = data.length_m ?? ''
      rec.width_m        = data.width_m ?? ''
      rec.area_m2        = data.area_m2 ?? ''
      rec.price_per_m2   = data.price_per_m2 ?? ''
      rec.created_at     = data.created_at ?? Date.now()
    })
  })

  //  Activity Log (best effort)
  try {
    await logAddOrderItem(
      userIdForLog,
      data.orderId,
      newRecord.id,
      {
        item_code: data.item_code ?? '',
        category: data.category ?? '',
        color: data.color ?? '',
        price: data.price,
        status: data.status ?? '',
        storage_status: data.storage_status ?? '',
        order_date: data.order_date ?? '',
        created_at: data.created_at ?? Date.now(),
      }
    )
  } catch (err) {
    console.warn('logAddOrderItem failed:', err)
  }

  return newRecord
}

/**  READ  */
export async function listOrderItems(limit = 200) {
  const items = database.get('order_items')
  return items
    .query(Q.sortBy('created_at', Q.desc), Q.take(limit))
    .fetch()
}

/**  READ  */
export async function listOrderItemsByOrder(orderId: string, limit = 200) {
  const items = database.get('order_items')
  return items
    .query(
      Q.where('order_id', orderId),
      Q.sortBy('created_at', Q.desc),
      Q.take(limit)
    )
    .fetch()
}

/**  UPDATE */
export async function updateOrderItem(
  id: string,
  data: UpdateOrderItem,
  userId: string = 'system'     //  log
) {
  const items = database.get('order_items')

  let beforeData: any = null
  let afterData: any = null
  let orderIdForLog = ''

  await database.write(async () => {
    const rec: any = await items.find(id)

    // before
    beforeData = {
      item_code: rec.item_code ?? '',
      category: rec.category ?? '',
      color: rec.color ?? '',
      price: rec.price ?? 0,
      status: rec.status ?? '',
      storage_status: rec.storage_status ?? '',
      order_date: rec.order_date ?? '',
    }

    // fetch τ--> relation για το orderId
    try {
      if (rec.order?.fetch) {
        const orderModel = await rec.order.fetch()
        orderIdForLog = orderModel?.id || ''
      }
    } catch {
      orderIdForLog = ''
    }

    // update
    await rec.update((r: any) => {
      if (data.item_code !== undefined)      r.item_code = data.item_code
      if (data.category !== undefined)       r.category = data.category
      if (data.color !== undefined)          r.color = data.color
      if (data.price !== undefined)          r.price = Number.isFinite(data.price) ? data.price : 0
      if (data.status !== undefined)         r.status = data.status
      if (data.storage_status !== undefined) r.storage_status = data.storage_status
      if (data.order_date !== undefined)     r.order_date = data.order_date
      if (data.length_m !== undefined)       r.length_m = data.length_m
      if (data.width_m !== undefined)        r.width_m = data.width_m
      if (data.area_m2 !== undefined)        r.area_m2 = data.area_m2
      if (data.price_per_m2 !== undefined)  r.price_per_m2 = data.price_per_m2
    })

    // after
    afterData = {
      item_code: rec.item_code ?? '',
      category: rec.category ?? '',
      color: rec.color ?? '',
      price: rec.price ?? 0,
      status: rec.status ?? '',
      storage_status: rec.storage_status ?? '',
      order_date: rec.order_date ?? '',
    }
  })

  //  Activity Log 
  try {
    await logUpdateOrderItem(userId, orderIdForLog || '', id, beforeData, afterData)
  } catch (err) {
    console.warn('logUpdateOrderItem failed:', err)
  }
}

/**  DELETE  */
export async function deleteOrderItem(id: string, orderId?: string, userId: string = 'system') {
  const items = database.get('order_items')

  const rec: any = await items.find(id)
  const itemData = {
    item_code: rec.item_code,
    category: rec.category,
    color: rec.color,
    price: rec.price,
    status: rec.status,
    storage_status: rec.storage_status,
    order_date: rec.order_date,
  }

  let orderIdFinal = orderId
  try {
    if (!orderIdFinal && rec.order?.fetch) {
      const orderModel = await rec.order.fetch()
      orderIdFinal = orderModel?.id || ''
    }
  } catch {
    // ignore
  }

  // log
  try {
    await logDeleteOrderItem(userId, orderIdFinal || '', id, itemData)
  } catch (err) {
    console.warn('logDeleteOrderItem failed:', err)
  }

  await database.write(async () => {
    await rec.destroyPermanently()
  })
}

export function observeOrderItemsByCustomer(
  customerId: string,
  opts?: { limit?: number }
) {
  const limit = opts?.limit ?? 500
  const items = database.get('order_items')

  // Join με orders: orders.customer_id = customerId
  return items
    .query(
      Q.on('orders', 'customer_id', customerId),
      Q.sortBy('created_at', Q.desc),
      Q.take(limit)
    )
    .observe()
}

// list of items
export async function listOrderItemsByCustomer(
  customerId: string,
  opts?: { limit?: number }
) {
  const limit = opts?.limit ?? 1000
  const orders = database.get('orders')
  const items  = database.get('order_items')

  // orders --> πελάτη
  const orderRows: any[] = await orders
    .query(Q.where('customer_id', customerId))
    .fetch()

  const orderIds = orderRows.map(o => o.id)
  if (orderIds.length === 0) return []

  //  items --> orders
  const itemRows = await items
    .query(
      Q.where('order_id', Q.oneOf(orderIds)),
      Q.sortBy('created_at', Q.desc),
      Q.take(limit)
    )
    .fetch()

  return itemRows
}

// load items =/ warehouse items
type ListFreeOpts = { limit?: number }

export async function listFreeOrderItems({ limit = 1000 }: ListFreeOpts = {}) {
  const witemsColl   = database.get('warehouse_items')
  const itemsColl    = database.get('order_items')
  const ordersColl   = database.get('orders')
  const customersColl= database.get('customers')

  // not "taken"
  const active = await witemsColl
    .query(Q.where('is_active', true))
    .fetch()

  const usedItemIds = new Set(active.map((w: any) => w._raw.item_id))

  let rows: any[] = await itemsColl
    .query(Q.sortBy('created_at', Q.desc))
    .fetch()

  rows = rows.filter(r => !usedItemIds.has(r.id))
  if (rows.length > limit) rows = rows.slice(0, limit)

  // helper (order_id)
  const getOrderId = (r: any): string | null =>
    r.order_id ?? r.order?.id ?? r._raw?.order_id ?? null

  const out: Array<{
    id: string
    order_id: string | null
    customer_id: string | null
    customer_name: string | null
    item_code: string
    category: string
    color: string
    price: number
    status: string
    storage_status: string
    order_date: string
    created_at: number
  }> = []

  for (const r of rows) {
    const orderId = getOrderId(r)

    // (best-effort)
    let customerId: string | null = null
    let customerName: string | null = null

    try {
      if (orderId) {
        const order: any = await ordersColl.find(orderId)
        // customer id --> aliases/raw
        customerId =
          order.customer?.id ??
          order.customer_id ??
          order._raw?.customer_id ??
          null

        if (customerId) {
          try {
            const c: any = await customersColl.find(customerId)
            const fn = (c.firstName ?? c.firstname ?? c._raw?.first_name ?? '').trim()
            const ln = (c.lastName ?? c.lastname ?? c._raw?.last_name ?? '').trim()
            const name = `${fn} ${ln}`.trim()
            customerName = name || null
          } catch {}
        }
      }
    } catch {}

    out.push({
      id: r.id,
      order_id: orderId,
      customer_id: customerId,
      customer_name: customerName,
      item_code: r.item_code ?? '',
      category: r.category ?? '',
      color: r.color ?? '',
      price: Number(r.price ?? 0),
      status: r.status ?? '',
      storage_status: r.storage_status ?? '',
      order_date: r.order_date ?? '',
      created_at: Number(r.created_at ?? r._raw?.created_at ?? Date.now()),
    })
  }

  return out
}