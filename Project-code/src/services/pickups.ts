// src/services/pickups.ts
import { Q } from '@nozbe/watermelondb'
import { database } from '../database/initializeDatabase'

/**  Types  */
export type NewPickup = {
  customerId: string            // FK -> customers.id
  pickupDate: string            // ISO datetime string
  pickupTimeStart?: string      // HH:mm format (start time)
  pickupTimeEnd?: string        // HH:mm format (end time)
  notes?: string
  createdBy: string            // FK -> users.id
}

export type UpdatePickup = Partial<{
  customerId: string
  pickupDate: string
  pickupTimeStart: string
  pickupTimeEnd: string
  notes: string
}>

/** CREATE */
export async function createPickup(data: NewPickup, userIdForLog: string = data.createdBy || 'system') {
  const pickups = database.get('pickups')
  const customers = database.get('customers')
  const users = database.get('users')

  let newRecord: any = null

  await database.write(async () => {
    const customerModel = await customers.find(data.customerId)
    
    // Try to find the user, fallback to 'system' if not found
    let userModel: any
    try {
      userModel = await users.find(data.createdBy)
    } catch {
      console.warn(`User ${data.createdBy} not found, falling back to 'system' user`)
      try {
        userModel = await users.find('system')
      } catch {
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

    newRecord = await pickups.create((rec: any) => {
      // Relations
      rec.customer.set(customerModel)
      rec.createdBy.set(userModel)

      // Fields
      rec.pickupDate = data.pickupDate
      rec.pickupTimeStart = data.pickupTimeStart || null
      rec.pickupTimeEnd = data.pickupTimeEnd || null
      rec.notes = data.notes || ''

      const now = Date.now()
      rec.createdAt = now
      rec.lastModifiedAt = now
    })
  })

  return newRecord
}

/** READ */
export async function getPickupById(id: string) {
  const pickups = database.get('pickups')
  return await pickups.find(id)
}

export async function listPickups(limit = 500) {
  const pickups = database.get('pickups')
  return await pickups
    .query(Q.sortBy('pickup_date', Q.desc), Q.take(limit))
    .fetch()
}

export async function listPickupsByDate(date: string) {
  // date is YYYY-MM-DD format
  const pickups = database.get('pickups')
  const startOfDay = date + 'T00:00:00.000Z'
  const endOfDay = date + 'T23:59:59.999Z'
  
  return await pickups
    .query(
      Q.where('pickup_date', Q.gte(startOfDay)),
      Q.where('pickup_date', Q.lte(endOfDay)),
      Q.sortBy('pickup_date', Q.asc)
    )
    .fetch()
}

export async function listPickupsByCustomer(customerId: string) {
  const pickups = database.get('pickups')
  return await pickups
    .query(
      Q.where('customer_id', customerId),
      Q.sortBy('pickup_date', Q.desc)
    )
    .fetch()
}

/** UPDATE */
export async function updatePickup(id: string, updates: UpdatePickup, userIdForLog: string = 'system') {
  const pickups = database.get('pickups')
  const pickup = await pickups.find(id)

  await database.write(async () => {
    await pickup.update((rec: any) => {
      if (updates.customerId !== undefined) {
        const customers = database.get('customers')
        customers.find(updates.customerId).then((customerModel: any) => {
          rec.customer.set(customerModel)
        })
      }
      if (updates.pickupDate !== undefined) rec.pickupDate = updates.pickupDate
      if (updates.pickupTimeStart !== undefined) rec.pickupTimeStart = updates.pickupTimeStart
      if (updates.pickupTimeEnd !== undefined) rec.pickupTimeEnd = updates.pickupTimeEnd
      if (updates.notes !== undefined) rec.notes = updates.notes
      rec.lastModifiedAt = Date.now()
    })
  })

  return pickup
}

/** DELETE */
export async function deletePickup(id: string, userIdForLog: string = 'system') {
  const pickups = database.get('pickups')
  const pickup = await pickups.find(id)

  await database.write(async () => {
    await pickup.destroyPermanently()
  })
}

/** OBSERVE (for reactive queries) */
export function observePickups() {
  const pickups = database.get('pickups')
  return pickups.query(Q.sortBy('pickup_date', Q.desc)).observe()
}

export function observePickupsByDate(date: string) {
  const pickups = database.get('pickups')
  const startOfDay = date + 'T00:00:00.000Z'
  const endOfDay = date + 'T23:59:59.999Z'
  
  return pickups
    .query(
      Q.where('pickup_date', Q.gte(startOfDay)),
      Q.where('pickup_date', Q.lte(endOfDay)),
      Q.sortBy('pickup_date', Q.asc)
    )
    .observe()
}

