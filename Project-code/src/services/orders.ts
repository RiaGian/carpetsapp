// src/services/orders.ts
import { Q } from '@nozbe/watermelondb'
import { database } from '../database/initializeDatabase'
import { logCreateOrder, logDeleteOrder, logOrderPaymentUpdated, logOrderStatusChanged, logUpdateOrder, } from './activitylog'

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
}>

/** CREATE */
export async function createOrder(data: NewOrder, userIdForLog: string = data.createdBy || 'system') {
  const orders    = database.get('orders')
  const customers = database.get('customers')
  const users     = database.get('users')

  let newRecord: any = null

  await database.write(async () => {
    const customerModel = await customers.find(data.customerId)
    const userModel     = await users.find(data.createdBy)

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
    // === Ειδικά logs για πληρωμή & κατάσταση ===
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

    // === Έλεγχος αν άλλαξε κάτι στα header fields ===
    const headerChanged = JSON.stringify(oldValues) !== JSON.stringify(newValues)

    // === Κάλεσέ το ΜΟΝΟ αν υπήρξαν αλλαγές (header, πληρωμή ή status) ===
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
