import { Q } from '@nozbe/watermelondb'
import { database } from '../database/initializeDatabase'

export type NewPayment = {
  orderId: string
  amount: number
  paymentType: 'deposit' | 'partial' | 'full'
  paymentMethod?: string
  notes?: string
  createdBy: string
}

export type PaymentData = {
  id: string
  orderId: string
  amount: number
  paymentType: string
  paymentMethod?: string
  notes?: string
  createdAt: number
}

/** CREATE */
export async function createPayment(
  data: NewPayment,
  userIdForLog: string = data.createdBy || 'system'
) {
  const payments = database.get('payments')
  const orders = database.get('orders')
  const users = database.get('users')

  let newRecord: any = null

  await database.write(async () => {
    const orderModel = await orders.find(data.orderId)

    // Try to find the user, fallback to 'system' if not found
    let userModel: any
    try {
      userModel = await users.find(data.createdBy)
    } catch (err) {
      console.warn(`User ${data.createdBy} not found, falling back to 'system' user`)
      try {
        userModel = await users.find('system')
      } catch (systemErr) {
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

    newRecord = await payments.create((rec: any) => {
      // Relations
      rec.order.set(orderModel)
      rec.createdBy.set(userModel)

      // Fields
      rec.amount = Number.isFinite(data.amount) ? data.amount : 0
      rec.paymentType = data.paymentType || 'partial'
      rec.paymentMethod = (data.paymentMethod ?? '').trim() || null
      rec.notes = (data.notes ?? '').trim() || null
      rec.createdAt = Date.now()
    })
  })

  return {
    id: newRecord.id,
    orderId: data.orderId,
    amount: newRecord.amount,
    paymentType: newRecord.paymentType,
    paymentMethod: newRecord.paymentMethod,
    notes: newRecord.notes,
    createdAt: newRecord.createdAt,
  }
}

/** READ - Get all payments for an order */
export async function listPaymentsByOrder(orderId: string): Promise<PaymentData[]> {
  try {
    // Check if payments table exists
    try {
      const payments = database.get('payments')
      if (!payments) {
        console.warn('⚠️ Payments table not available - database may need to be reset')
        console.warn('💡 To reset database: In browser console, run: resetDbWeb()')
        return []
      }

      const rows = await payments
        .query(
          Q.where('order_id', orderId),
          Q.sortBy('created_at', Q.asc)
        )
        .fetch()

      return rows.map((r: any) => ({
        id: r.id,
        orderId: r.order_id ?? r.order?.id ?? r._raw?.order_id ?? '',
        amount: r.amount ?? 0,
        paymentType: r.paymentType ?? r._raw?.payment_type ?? '',
        paymentMethod: r.paymentMethod ?? r._raw?.payment_method ?? null,
        notes: r.notes ?? r._raw?.notes ?? null,
        createdAt: r.createdAt ?? r._raw?.created_at ?? Date.now(),
      }))
    } catch (tableErr: any) {
      // Table doesn't exist - this happens when schema version changed but DB wasn't reset
      if (tableErr?.message?.includes('payments') || tableErr?.message?.includes('not found')) {
        console.warn('⚠️ Payments table does not exist yet!')
        console.warn('💡 Database needs to be reset to create the new payments table.')
        console.warn('💡 In browser console, run: resetDbWeb()')
        console.warn('💡 This will delete all data and recreate the database with the new schema.')
      }
      return []
    }
  } catch (err) {
    console.warn('Failed to list payments for order:', orderId, err)
    return []
  }
}

/** READ - Get total paid amount for an order */
export async function getTotalPaidForOrder(orderId: string): Promise<number> {
  try {
    const payments = await listPaymentsByOrder(orderId)
    return payments.reduce((sum, payment) => sum + (payment.amount || 0), 0)
  } catch (err) {
    console.warn('Failed to get total paid for order:', orderId, err)
    return 0
  }
}

/** READ - Observe payments for an order (reactive) */
export function observePaymentsByOrder(orderId: string) {
  const payments = database.get('payments')
  return payments
    .query(
      Q.where('order_id', orderId),
      Q.sortBy('created_at', Q.asc)
    )
    .observe()
}

