import { Q } from '@nozbe/watermelondb'
import { database } from '../database/initializeDatabase'
import {
  logCreateCustomer,
  logDeleteCustomer,
  logUpdateCustomer,
} from './activitylog'

export type NewCustomer = {
  firstName: string
  lastName: string
  phone?: string
  address?: string
  afm?: string
  notes?: string
}
// insert customer - create
export async function createCustomer(data: NewCustomer) {
  const customers = database.get('customers')

  let newRecord: any = null
  await database.write(async () => {
    newRecord = await customers.create((rec: any) => {
      rec.firstName       = data.firstName.trim()
      rec.lastName        = data.lastName.trim()
      rec.phone           = data.phone ?? ''
      rec.address         = data.address ?? ''
      rec.afm             = data.afm ?? ''
      rec.notes           = data.notes ?? ''
      const now           = Date.now()
      rec.createdAt       = now
      rec.lastModifiedAt  = now
    })
  })

  console.log('Customer inserted (raw):', newRecord._raw)
  console.log('Customer inserted (model):', {
    id: newRecord.id,
    firstName: newRecord.firstName,
    lastName: newRecord.lastName,
    createdAt: newRecord.createdAt,
  })

  // Activity log: CREATE (best-effort)
  try {
    const userId = 'system'
    await logCreateCustomer(userId, newRecord.id, {
      firstName: data.firstName,
      lastName:  data.lastName,
      phone:     data.phone ?? '',
      address:   data.address ?? '',
      afm:       data.afm ?? '',
      notes:     data.notes ?? '',
    })
    console.log('logCreateCustomer OK')
  } catch (err) {
    console.warn('logCreateCustomer failed:', err)
  }

  return newRecord
}
// live observe
export function observeCustomers(limit = 200) {
  const customers = database.get('customers')
  return customers
    .query(Q.sortBy('created_at', Q.desc), Q.take(limit))
    .observe()
}

export async function listCustomers(limit = 200) {
  const customers = database.get('customers')
  return customers
    .query(Q.sortBy('created_at', Q.desc), Q.take(limit))
    .fetch()
}
// delete customers
export async function deleteCustomer(id: string) {
  const customers = database.get('customers')
  let deletedData: any = null

  await database.write(async () => {
    const rec: any = await customers.find(id)

    // snapshot πριν τη διαγραφή
    deletedData = {
      firstName: rec.firstName,
      lastName:  rec.lastName,
      phone:     rec.phone,
      address:   rec.address,
      afm:       rec.afm,
      notes:     rec.notes,
      createdAt: rec.createdAt,
    }

    await rec.destroyPermanently()
  })

  console.log('Customer deleted:', id)

  // Activity log: DELETE (best-effort)
  try {
    const userId = 'system'
    await logDeleteCustomer(userId, id, deletedData)
    console.log('logDeleteCustomer OK')
  } catch (err) {
    console.warn('logDeleteCustomer failed:', err)
  }
}
// update customer
export type UpdateCustomer = Partial<{
  firstName: string
  lastName: string
  phone: string
  address: string
  afm: string
  notes: string
}>
// update customer
export async function updateCustomer(id: string, data: UpdateCustomer) {
  const customers = database.get('customers')
  let oldValues: any = null
  let newValues: any = null

  await database.write(async () => {
    const rec: any = await customers.find(id)

    // snapshot πριν την ενημέρωση
    oldValues = {
      firstName: rec.firstName,
      lastName:  rec.lastName,
      phone:     rec.phone,
      address:   rec.address,
      afm:       rec.afm,
      notes:     rec.notes,
    }

    await rec.update((r: any) => {
      if (typeof data.firstName !== 'undefined') r.firstName = data.firstName.trim()
      if (typeof data.lastName  !== 'undefined') r.lastName  = data.lastName.trim()
      if (typeof data.phone     !== 'undefined') r.phone     = data.phone ?? ''
      if (typeof data.address   !== 'undefined') r.address   = data.address ?? ''
      if (typeof data.afm       !== 'undefined') r.afm       = data.afm ?? ''
      if (typeof data.notes     !== 'undefined') r.notes     = data.notes ?? ''
      r.lastModifiedAt = Date.now()
    })

    // snapshot μετά την ενημέρωση
    newValues = {
      firstName: rec.firstName,
      lastName:  rec.lastName,
      phone:     rec.phone,
      address:   rec.address,
      afm:       rec.afm,
      notes:     rec.notes,
    }
  })

  console.log('Customer updated:', id, data)

  // Activity log: UPDATE (best-effort)
  try {
    const userId = 'system'
    await logUpdateCustomer(userId, id, oldValues, newValues)
    console.log('logUpdateCustomer OK')
  } catch (err) {
    console.warn('logUpdateCustomer failed:', err)
  }
}
