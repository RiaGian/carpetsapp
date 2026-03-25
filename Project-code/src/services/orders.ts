// src/services/orders.ts
import { Q } from '@nozbe/watermelondb'
import { database } from '../database/initializeDatabase'
import { logCreateOrder, logDeleteOrder, logDeleteOrderItem, logOrderPaymentUpdated, logOrderStatusChanged, logUpdateOrder, } from './activitylog'

/**  Types  */
export type NewOrder = {
  customerId: string            // FK -> customers.id
  paymentMethod: string         // 'cash' | 'card' | 'bank' | 'mixed' | ...
  deposit: number
  totalAmount: number
  notes?: string
  orderDate: string             // string στο schema
  createdBy: string            // FK -> users.id
  orderStatus?: string   
  hasDebt?: boolean 
  receiptNumber?: string
        
}
// update order
export type UpdateOrder = Partial<{
  customerId: string
  paymentMethod: string
  deposit: number
  totalAmount: number
  notes: string
  orderDate: string
  createdBy: string
  orderStatus: string 
  hasDebt: boolean      
  receiptNumber: string
  deliveryDate: string // ISO datetime string
}>

/** CREATE */
export async function createOrder(data: NewOrder, userIdForLog: string = data.createdBy || 'system') {
  const orders    = database.get('orders')
  const customers = database.get('customers')
  const users     = database.get('users')

  let newRecord: any = null

  await database.write(async () => {
    const customerModel = await customers.find(data.customerId)
    
    // Try to find the user, fallback to 'system' if not found
    let userModel: any
    try {
      userModel = await users.find(data.createdBy)
    } catch (err) {
      console.warn(`User ${data.createdBy} not found, falling back to 'system' user`)
      try {
        userModel = await users.find('system')
      } catch (systemErr) {
        // If system user doesn't exist, create it
        console.warn('System user not found, creating it...')
        userModel = await users.create((u: any) => {
          u._raw.id = 'system'
          u.email = 'system@example.com'
          u.password_hash = '1234'
          u.name = 'System User'
          u.created_at = Date.now()
        })
      }
    }

    newRecord = await orders.create((rec: any) => {
      // Relations
      rec.customer.set(customerModel)
      rec.createdBy.set(userModel)

      // Fields (όπως στο schema / μοντέλο)
      rec.paymentMethod  = (data.paymentMethod ?? '').trim()
      rec.deposit        = Number.isFinite(data.deposit) ? data.deposit : 0
      rec.totalAmount    = Number.isFinite(data.totalAmount) ? data.totalAmount : 0
      rec.notes          = data.notes ?? ''
      rec.orderDate      = data.orderDate
      rec.orderStatus    = (data.orderStatus ?? 'Νέα').trim()
      rec.hasDebt        = data.hasDebt ?? false
      rec.receiptNumber  = (data as any).receiptNumber?.trim() || '-'

      const now          = Date.now()
      rec.createdAt      = now
      rec.lastModifiedAt = now
    })
  })

  // Activity log (best-effort)
  try {
    await logCreateOrder(userIdForLog, newRecord.id, {
      customerId:    data.customerId,
      paymentMethod: newRecord.paymentMethod,
      deposit:       newRecord.deposit,
      totalAmount:   newRecord.totalAmount,
      notes:         newRecord.notes ?? '',
      orderDate:     newRecord.orderDate,
      orderStatus:   newRecord.orderStatus,
      hasDebt:       newRecord.hasDebt,
    })
  } catch (err) {
    console.warn('logCreateOrder failed:', err)
  }

  return newRecord
}

/** READ (όλων) */
export function observeOrders(limit = 200) {
  const orders = database.get('orders')
  return orders
    .query(Q.sortBy('created_at', Q.desc), Q.take(limit))
    .observe()
}

/** READ (ενεργές - όχι παραδομένες) */
export function observeActiveOrders(limit = 200) {
  const orders = database.get('orders')
  return orders
    .query(
      Q.where('order_status', Q.notLike('Παραδόθηκε')),
      Q.sortBy('created_at', Q.desc),
      Q.take(limit)
    )
    .observe()
}

/** READ (προς παράδοση - για calendar) */
export function observeReadyForDeliveryOrders(limit = 1000) {
  const orders = database.get('orders')
  return orders
    .query(
      Q.where('order_status', 'Προς παράδοση'),
      Q.where('delivery_date', Q.notLike('')), // Only orders with delivery_date (not empty)
      Q.sortBy('delivery_date', Q.asc), // Sort by delivery date
      Q.take(limit)
    )
    .observe()
}

export async function listOrders(limit = 200) {
  const orders = database.get('orders')
  return orders
    .query(Q.sortBy('created_at', Q.desc), Q.take(limit))
    .fetch()
}

/** = READ */
export function observeOrdersByCustomer(
  customerId: string,
  opts?: { limit?: number; createdBy?: string | null }
) {
  const limit = opts?.limit ?? 200
  const createdBy = opts?.createdBy ?? null

  const orders = database.get('orders')
  const filters: any[] = [Q.where('customer_id', customerId)]
  if (createdBy) filters.push(Q.where('created_by', createdBy))

  return orders
    .query(...filters, Q.sortBy('created_at', Q.desc), Q.take(limit))
    .observe()
}

export async function listOrdersByCustomer(
  customerId: string,
  opts?: { limit?: number; createdBy?: string | null }
) {
  const limit = opts?.limit ?? 200
  const createdBy = opts?.createdBy ?? null

  const orders = database.get('orders')
  const filters: any[] = [Q.where('customer_id', customerId)]
  if (createdBy) filters.push(Q.where('created_by', createdBy))

  return orders
    .query(...filters, Q.sortBy('created_at', Q.desc), Q.take(limit))
    .fetch()
}

/**  READ ( */
export async function getOrderById(id: string) {
  const orders = database.get('orders')
  const rec: any = await orders.find(id)
  return {
    id: rec.id,
    paymentMethod: rec.paymentMethod,
    deposit: rec.deposit,
    totalAmount: rec.totalAmount,
    notes: rec.notes,
    orderDate: rec.orderDate,
    orderStatus: rec.orderStatus,
    hasDebt: rec.hasDebt,
    createdAt: rec.createdAt,
    lastModifiedAt: rec.lastModifiedAt,
    customerId: rec.customer?.id ?? rec.customer_id, 
    createdBy: rec.createdBy?.id ?? rec.created_by,
    receiptNumber: rec.receiptNumber ?? rec._raw?.receipt_number ?? null,
    deliveryDate: rec.deliveryDate ?? rec._raw?.delivery_date ?? null,
  }
}

/**  UPDATE*/
export async function updateOrder(
  id: string,
  data: UpdateOrder,
  userIdForLog: string = 'system'
) {
  const orders    = database.get('orders')
  const customers = database.get('customers')
  const users     = database.get('users')

  let oldValues: any = null
  let newValues: any = null

  await database.write(async () => {
    const rec: any = await orders.find(id)

    // snapshot πριν (για logging)
    oldValues = {
      paymentMethod: rec.paymentMethod,
      deposit:       rec.deposit,
      totalAmount:   rec.totalAmount,
      notes:         rec.notes,
      orderDate:     rec.orderDate,
      orderStatus:   rec.orderStatus,
      hasDebt: rec.hasDebt,
      customerId:    rec.customer?.id ?? rec.customer_id,
      createdBy:     rec.createdBy?.id ?? rec.created_by,
    }

    // Προ-φέρε related models με ασφάλεια (χωρίς throw)
    let customerModel: any = null
    if (typeof data.customerId !== 'undefined') {
      try { customerModel = await customers.find(data.customerId) } catch {}
    }
    let userModel: any = null
    if (typeof data.createdBy !== 'undefined') {
      try { userModel = await users.find(data.createdBy) } catch {}
    }

    await rec.update((r: any) => {
      // Relations
      if (customerModel) r.customer.set(customerModel)
      if (userModel)     r.createdBy.set(userModel)

      // Fields (guards όπως στους customers)
      if (typeof data.paymentMethod !== 'undefined') {
        r.paymentMethod = (data.paymentMethod ?? '').trim()
      }
      if (typeof data.deposit !== 'undefined') {
        const val = Number(data.deposit)
        if (Number.isFinite(val)) r.deposit = val
      }
      if (typeof data.totalAmount !== 'undefined') {
        const val = Number(data.totalAmount)
        if (Number.isFinite(val)) r.totalAmount = val
      }
      if (typeof data.receiptNumber !== 'undefined') {
        r.receiptNumber = (data.receiptNumber ?? '').trim()
      }
      if (typeof data.notes !== 'undefined') {
        r.notes = data.notes ?? ''
      }
      if (typeof data.orderDate !== 'undefined') {
        r.orderDate = data.orderDate
      }
      if (typeof data.orderStatus !== 'undefined') {  
        r.orderStatus = (data.orderStatus ?? '').trim()
      }
      if (typeof data.hasDebt !== 'undefined') {
        r.hasDebt = !!data.hasDebt
      }
      if (typeof data.deliveryDate !== 'undefined') {
        r.deliveryDate = data.deliveryDate || null
      }

      r.lastModifiedAt = Date.now()
    })

    // snapshot μετά
    newValues = {
      paymentMethod: rec.paymentMethod,
      deposit:       rec.deposit,
      totalAmount:   rec.totalAmount,
      notes:         rec.notes,
      orderDate:     rec.orderDate,
      orderStatus:   rec.orderStatus,
      hasDebt: rec.hasDebt,
      customerId:    rec.customer?.id ?? rec.customer_id,
      createdBy:     rec.createdBy?.id ?? rec.created_by,
    }
  })

  // Activity log (best-effort)
  try {
    // logs για πληρωμή & κατάσταση
    const oldPay = {
      paymentMethod: oldValues.paymentMethod ?? '',
      deposit: Number(oldValues.deposit ?? 0),
      totalAmount: Number(oldValues.totalAmount ?? 0),
    }
    const newPay = {
      paymentMethod: newValues.paymentMethod ?? '',
      deposit: Number(newValues.deposit ?? 0),
      totalAmount: Number(newValues.totalAmount ?? 0),
    }

    const paymentChanged =
      oldPay.paymentMethod !== newPay.paymentMethod ||
      oldPay.deposit !== newPay.deposit ||
      oldPay.totalAmount !== newPay.totalAmount

    if (paymentChanged) {
      await logOrderPaymentUpdated(userIdForLog, id, oldPay, newPay)
    }

    const oldStatus = (oldValues.orderStatus ?? '').trim()
    const newStatus = (newValues.orderStatus ?? '').trim()
    const statusChanged = !!oldStatus && !!newStatus && oldStatus !== newStatus

    if (statusChanged) {
      await logOrderStatusChanged(userIdForLog, id, oldStatus, newStatus)
    }

    //  Έλεγχος αν άλλαξε κάτι στα header fields 
    const headerChanged = JSON.stringify(oldValues) !== JSON.stringify(newValues)

    //Κάλεσέ το ΜΟΝΟ αν υπήρξαν αλλαγές (header, πληρωμή ή status)
    if (headerChanged || paymentChanged || statusChanged) {
      await logUpdateOrder(userIdForLog, id, oldValues, newValues)
    }

  } catch (err) {
    console.warn('order targeted logs failed:', err)
  }

}


/** DELETE  */
export async function deleteOrder(id: string, userIdForLog: string = 'system') {
  const orders = database.get('orders')
  let snapshot: any = null

  await database.write(async () => {
    const rec: any = await orders.find(id)

    // snapshot για log
    snapshot = {
      paymentMethod: rec.paymentMethod,
      deposit:       rec.deposit,
      totalAmount:   rec.totalAmount,
      notes:         rec.notes,
      orderDate:     rec.orderDate,
      orderStatus:   rec.orderStatus,
      hasDebt: rec.hasDebt,
      createdAt:     rec.createdAt,
      customerId:    rec.customer?.id ?? rec.customer_id,
      createdBy:     rec.createdBy?.id ?? rec.created_by,
    }

    await rec.destroyPermanently()
  })

  // Activity log (best-effort)
  try {
    await logDeleteOrder(userIdForLog, id, snapshot)
  } catch (err) {
    console.warn('logDeleteOrder failed:', err)
  }
}



export async function deleteOrderOnly(id: string) {
  const orders = database.get('orders')
  await database.write(async () => {
    const rec: any = await orders.find(id)
    await rec.destroyPermanently()
  })
}
// DELETE ORDER, ORDER ITEMS, 
export async function deleteOrderCascade(orderId: string, userIdForLog: string = 'system') {
  const ordersColl = database.get('orders')
  const itemsColl  = database.get('order_items')

  let snapshotForLog: any = null

  await database.write(async () => {
    const orderRec: any = await ordersColl.find(orderId)

    // Φέρε όλα τα items του order
    const itemRows: any[] = await itemsColl
      .query(Q.where('order_id', orderId))
      .fetch()

    // Snapshot για logging (order + items)
    const itemsData = itemRows.map((r: any) => ({
      id: r.id,
      item_code: r.item_code ?? '',
      category: r.category ?? '',
      color: r.color ?? '',
      price: Number(r.price ?? 0),
      status: r.status ?? '',
      storage_status: r.storage_status ?? '',
      order_date: r.order_date ?? '',
      created_at: Number(r.created_at ?? r._raw?.created_at ?? Date.now()),
    }))

    snapshotForLog = {
      id: orderRec.id,
      paymentMethod: orderRec.paymentMethod,
      deposit:       orderRec.deposit,
      totalAmount:   orderRec.totalAmount,
      notes:         orderRec.notes,
      orderDate:     orderRec.orderDate,
      orderStatus:   orderRec.orderStatus,
      hasDebt:       orderRec.hasDebt,
      createdAt:     orderRec.createdAt,
      customerId:    orderRec.customer?.id ?? orderRec.customer_id,
      createdBy:     orderRec.createdBy?.id ?? orderRec.created_by,
      items:         itemsData,
    }

    // Batch: σβήσε πρώτα τα items, μετά το order
    const ops = [
      ...itemRows.map((r: any) => r.prepareDestroyPermanently()),
      orderRec.prepareDestroyPermanently(),
    ]
    await database.batch(...ops)
  })

  // Activity log (εκτός write): πρώτα ανά item, μετά η συνολική παραγγελία
  try {
    const items: any[] = Array.isArray(snapshotForLog?.items) ? snapshotForLog.items : []

    // Κάλεσε όσες φορές χρειάζεται το logDeleteOrderItem
    const perItemLogs = items.map((it: any) =>
      logDeleteOrderItem(userIdForLog, snapshotForLog.id, it.id, {
        ...it,
        timestamp: new Date().toISOString(),
      })
    )

    // Μην μπλοκάρεις το flow αν κάποιο αποτύχει
    await Promise.allSettled(perItemLogs)

    // Τέλος, log για την ίδια την παραγγελία (με όλο το snapshot)
    await logDeleteOrder(
      userIdForLog,
      orderId,
      { ...snapshotForLog, timestamp: new Date().toISOString() }
    )

  } catch (err) {
    console.warn('cascade delete logs failed:', err)
  }
}
