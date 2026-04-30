
import { Q } from '@nozbe/watermelondb';
import { database } from '../database/initializeDatabase';
import { logAddOrderItem, logDeleteOrderItem, logUpdateOrderItem } from './activitylog'; //  logging

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

    newRecord = await items.create((rec: any) => {
      rec.order.set(orderModel)
      rec.item_code      = data.item_code ?? ''
      rec.category       = data.category ?? ''
      rec.color          = data.color ?? ''
      rec.price          = Number.isFinite(data.price) ? data.price : 0
      rec.status         = data.status ?? ''
      rec.storage_status = data.storage_status ?? ''
      rec.order_date     = data.order_date ?? ''
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