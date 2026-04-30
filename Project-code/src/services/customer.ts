import { Q } from '@nozbe/watermelondb'
import { database } from '../database/initializeDatabase'

import {
  logAddCustomerAddress,
  logAddCustomerPhone,
  logCreateCustomer,
  logDeleteCustomer,
  logDeleteCustomerAddress,
  logDeleteCustomerPhone,
  logUpdateCustomer,
  logUpdateCustomerAddress,
  logUpdateCustomerPhone,
} from './activitylog'

const norm = (s: string) => (s ?? '').toString().trim()

//  " | " 
function splitPipeList(s: string | undefined | null): string[] {
  return (s ?? '')
    .split('|')
    .map(x => norm(x))
    .filter(Boolean)
}

async function getChildRows(customerId: string) {
  const phonesCollection = database.get('customer_phones')
  const addressesCollection = database.get('customer_addresses')

  const [phoneRows, addressRows] = await Promise.all([
    phonesCollection.query(Q.where('customer_id', customerId)).fetch(),
    addressesCollection.query(Q.where('customer_id', customerId)).fetch(),
  ])

  return { phoneRows, addressRows }
}

// --- SINGLE-ROW per customer helpers ---

async function upsertPhoneRow(userId: string, customerId: string, phones: string[]) {
  const phonesCol = database.get('customer_phones')
  const parent = await database.get('customers').find(customerId)
  const joined = phones.map(norm).filter(Boolean).join(' | ')

  const existing = await phonesCol.query(Q.where('customer_id', customerId)).fetch()

  if (existing.length === 0) {
    await database.write(async () => {
      await phonesCol.create((rec: any) => {
        rec.customer.set(parent)
        rec.phone_number = joined
        rec.created_at = Date.now()
      })
    })
    if (joined) await logAddCustomerPhone(userId, customerId, joined)
    return
  }

  const keep: any = existing[0]
  const rest: any[] = existing.slice(1)

  // merge αν βρεις παραπάνω από 1 (cleanup)
  if (rest.length) {
    const merged = Array.from(new Set(
      [keep.phone_number, ...rest.map(r => r.phone_number), joined]
        .join(' | ')
        .split('|')
        .map(s => norm(s))
        .filter(Boolean)
    )).join(' | ')

    const oldVal = keep.phone_number ?? ''
    await database.write(async () => {
      await keep.update((r: any) => { r.phone_number = merged })
      for (const r of rest) await r.destroyPermanently()
    })
    if (oldVal !== merged) await logUpdateCustomerPhone(userId, customerId, oldVal, merged)
    return
  }

  // update of insertion
  const oldVal = keep.phone_number ?? ''
  if (oldVal !== joined) {
    await database.write(async () => {
      await keep.update((r: any) => { r.phone_number = joined })
    })
    await logUpdateCustomerPhone(userId, customerId, oldVal, joined)
  }
}

async function upsertAddressRow(userId: string, customerId: string, addresses: string[]) {
  const addrCol = database.get('customer_addresses')
  const parent = await database.get('customers').find(customerId)
  const joined = addresses.map(norm).filter(Boolean).join(' | ')

  const existing = await addrCol.query(Q.where('customer_id', customerId)).fetch()

  if (existing.length === 0) {
    await database.write(async () => {
      await addrCol.create((rec: any) => {
        rec.customer.set(parent)
        rec.address = joined
      })
    })
    if (joined) await logAddCustomerAddress(userId, customerId, joined)
    return
  }

  const keep: any = existing[0]
  const rest: any[] = existing.slice(1)

  if (rest.length) {
    const merged = Array.from(new Set(
      [keep.address, ...rest.map(r => r.address), joined]
        .join(' | ')
        .split('|')
        .map(s => norm(s))
        .filter(Boolean)
    )).join(' | ')

    const oldVal = keep.address ?? ''
    await database.write(async () => {
      await keep.update((r: any) => { r.address = merged })
      for (const r of rest) await r.destroyPermanently()
    })
   await logUpdateCustomerAddress(userId, customerId, oldVal, merged)
    return
  }

  const oldVal = keep.address ?? ''
  if (oldVal !== joined) {
    await database.write(async () => {
      await keep.update((r: any) => { r.address = joined })
    })
    await logUpdateCustomerAddress(userId, customerId, oldVal, joined)
  }
}


// index-based sync -> UPDATE logs ...
async function syncPhonesWithIndexLogs(userId: string, customerId: string, nextPhones: string[]) {
  const phonesCollection = database.get('customer_phones')
  const { phoneRows } = await getChildRows(customerId)

  const prev = phoneRows.map((r: any) => ({ id: r.id, value: r.phone_number }))
  const curr = nextPhones

  const maxLen = Math.max(prev.length, curr.length)

  for (let i = 0; i < maxLen; i++) {
    const prevVal = prev[i]?.value
    const prevId  = prev[i]?.id
    const nextVal = curr[i]

    if (prevVal && nextVal) {
      if (norm(prevVal) !== norm(nextVal)) {
        await database.write(async () => {
          const rec: any = await phonesCollection.find(prevId)
          await rec.update((r: any) => { r.phone_number = nextVal })
        })
        await logUpdateCustomerPhone(userId, customerId, prevVal, nextVal)
      }
    } else if (!prevVal && nextVal) {
      const parent = await database.get('customers').find(customerId)
      await database.write(async () => {
        await phonesCollection.create((rec: any) => {
          rec.customer.set(parent)        //  parent Model
          rec.phone_number = nextVal
          rec.created_at   = Date.now()
        })
      })
      await logAddCustomerPhone(userId, customerId, nextVal)
    } else if (prevVal && !nextVal) {
      await database.write(async () => {
        const rec: any = await phonesCollection.find(prevId)
        await rec.destroyPermanently()
      })
      await logDeleteCustomerPhone(userId, customerId, prevVal)
    }
  }
}

async function syncAddressesWithIndexLogs(userId: string, customerId: string, nextAddresses: string[]) {
  const addressesCollection = database.get('customer_addresses')
  const { addressRows } = await getChildRows(customerId)

  const prev = addressRows.map((r: any) => ({ id: r.id, value: r.address }))
  const curr = nextAddresses

  const maxLen = Math.max(prev.length, curr.length)

  for (let i = 0; i < maxLen; i++) {
    const prevVal = prev[i]?.value
    const prevId  = prev[i]?.id
    const nextVal = curr[i]

    if (prevVal && nextVal) {
      if (norm(prevVal) !== norm(nextVal)) {
        await database.write(async () => {
          const rec: any = await addressesCollection.find(prevId)
          await rec.update((r: any) => { r.address = nextVal })
        })
        await logUpdateCustomerAddress(userId, customerId, prevVal, nextVal)
      }
    } else if (!prevVal && nextVal) {
      const parent = await database.get('customers').find(customerId)
      await database.write(async () => {
        await addressesCollection.create((rec: any) => {
          rec.customer.set(parent)        
          rec.address = nextVal
        })
      })

      await logAddCustomerAddress(userId, customerId, nextVal)
    } else if (prevVal && !nextVal) {
      await database.write(async () => {
        const rec: any = await addressesCollection.find(prevId)
        await rec.destroyPermanently()
      })
      await logDeleteCustomerAddress(userId, customerId, prevVal)
    }
  }
}

export type NewCustomer = {
  firstName: string
  lastName: string
  phone?: string
  address?: string
  afm?: string
  notes?: string
}
// insert customer + phones/address + log
export async function createCustomer(data: NewCustomer, userIdForLog: string = 'system') {
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

  // add phones/addresses as single-row per customer
  try {
    const phonesList    = splitPipeList(newRecord.phone)
    const addressesList = splitPipeList(newRecord.address)

    await upsertPhoneRow(userIdForLog, newRecord.id, phonesList)
    await upsertAddressRow(userIdForLog, newRecord.id, addressesList)
  } catch (err) {
    console.warn('createCustomer: contacts upsert failed:', err)
  }

  // Activity log: CREATE (best-effort)
  try {
    await logCreateCustomer(userIdForLog, newRecord.id, {
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

// delete customer + phones/address + log
export async function deleteCustomer(id: string, userIdForLog: string = 'system') {
  const customers = database.get('customers')
  let deletedData: any = null
  let phoneRows: any[] = []
  let addressRows: any[] = []

  await database.write(async () => {
    const rec: any = await customers.find(id)

    deletedData = {
      firstName: rec.firstName,
      lastName:  rec.lastName,
      phone:     rec.phone,
      address:   rec.address,
      afm:       rec.afm,
      notes:     rec.notes,
      createdAt: rec.createdAt,
    }

    const phonesCollection = database.get('customer_phones')
    const addressesCollection = database.get('customer_addresses')

    phoneRows = await phonesCollection.query(Q.where('customer_id', id)).fetch()
    addressRows = await addressesCollection.query(Q.where('customer_id', id)).fetch()

    for (const r of phoneRows) await r.destroyPermanently()
    for (const r of addressRows) await r.destroyPermanently()

    await rec.destroyPermanently()
  })

  console.log('Customer deleted:', id)

  // Logs
  try {
    for (const r of phoneRows) {
      await logDeleteCustomerPhone(userIdForLog, id, r.phone_number)
    }
    for (const r of addressRows) {
      await logDeleteCustomerAddress(userIdForLog, id, r.address)
    }
    await logDeleteCustomer(userIdForLog, id, deletedData)
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
// update customer + phones/address + log
export async function updateCustomer(id: string, data: UpdateCustomer,  userIdForLog: string = 'system') {
  const customers = database.get('customers')
  let oldValues: any = null
  let newValues: any = null

  await database.write(async () => {
    const rec: any = await customers.find(id)

    // snapshot before
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

    // snapshot after
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
    await logUpdateCustomer(userIdForLog, id, oldValues, newValues)
    console.log('logUpdateCustomer OK')
  } catch (err) {
    console.warn('logUpdateCustomer failed:', err)
  }

  //  Sync child single-row (pipe-joined) 
try {

  const newPhones = splitPipeList(newValues.phone)
  const newAddresses = splitPipeList(newValues.address)
  await upsertPhoneRow(userIdForLog, id, newPhones)
  await upsertAddressRow(userIdForLog, id, newAddresses)
  console.log('updateCustomer: contacts single-row upserted')
} catch (err) {
  console.warn('updateCustomer: contacts upsert failed:', err)
}
}

