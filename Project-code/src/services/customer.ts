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

const pairAddressCity = (addresses: string[], cities: string[]) =>
  addresses.map((a, i) => {
    const addr = (a ?? '').trim()
    const city = (cities[i] ?? '').trim()
    return city ? `${addr}, ${city}` : addr
  })

export async function getChildRows(customerId: string) {
  const phonesCollection = database.get('customer_phones')
  const addressesCollection = database.get('customer_addresses')

  const [phoneRows, addressRows] = await Promise.all([
    phonesCollection.query(Q.where('customer_id', customerId)).fetch(),
    addressesCollection.query(Q.where('customer_id', customerId)).fetch(),
  ])

  return { phoneRows, addressRows }
}

// Enrich customer data with phones and addresses from separate tables
// firstName, lastName, afm, notes, etc. come from the customer table
// phones come from customer_phones table
// addresses come from customer_addresses table
export async function enrichCustomerWithContacts(customer: any) {
  try {
    const { phoneRows, addressRows } = await getChildRows(customer.id)
    
    // Get all phone numbers from customer_phones table
    const phones = phoneRows.map((r: any) => r.phone_number || '').filter(Boolean)
    
    // Get all addresses with cities from customer_addresses table
    const addresses = addressRows.map((r: any) => {
      const addr = r.address || ''
      const city = r.city || ''
      return { address: addr, city: city }
    })
    
    // Return customer data with enriched phones/addresses
    // All customer fields (firstName, lastName, afm, notes, etc.) are preserved from customer table
    return {
      // Customer table fields (preserved)
      id: customer.id,
      firstName: customer.firstName || '',
      lastName: customer.lastName || '',
      afm: customer.afm || '',
      notes: customer.notes || '',
      createdAt: customer.createdAt,
      lastModifiedAt: customer.lastModifiedAt,
      // Enriched from customer_phones table
      phones: phones,
      phone: phones[0] || '', // First phone for backward compatibility
      // Enriched from customer_addresses table
      addresses: addresses,
      address: addresses[0]?.address || '', // First address for backward compatibility
      city: addresses[0]?.city || '', // First city for backward compatibility
    }
  } catch (error) {
    console.warn('Failed to enrich customer with contacts:', error)
    // Return customer data without enrichment if fetch fails
    return {
      id: customer.id,
      firstName: customer.firstName || '',
      lastName: customer.lastName || '',
      afm: customer.afm || '',
      notes: customer.notes || '',
      createdAt: customer.createdAt,
      lastModifiedAt: customer.lastModifiedAt,
      phones: [],
      addresses: [],
      phone: '',
      address: '',
      city: '',
    }
  }
}

// Enrich multiple customers with their contacts
export async function enrichCustomersWithContacts(customers: any[]) {
  return Promise.all(customers.map(c => enrichCustomerWithContacts(c)))
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

// services/customers.ts
async function upsertAddressRow(
  userId: string,
  customerId: string,
  entries: string[] // κάθε entry είναι "Διεύθυνση, Πόλη"
) {
  const addrCol = database.get('customer_addresses')
  const parent = await database.get('customers').find(customerId)

  const joined = entries.map(s => (s ?? '').trim()).filter(Boolean).join(' | ')
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
        .map(s => (s ?? '').trim())
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
export async function syncPhonesWithIndexLogs(userId: string, customerId: string, nextPhones: string[]) {
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

export async function syncAddressesWithIndexLogs(userId: string, customerId: string, nextAddresses: string[]) {
  const addressesCollection = database.get('customer_addresses')
  const { addressRows } = await getChildRows(customerId)

  // Parse addresses: format is "Address, City" or just "Address"
  const parseAddress = (addrStr: string) => {
    if (addrStr.includes(',')) {
      const parts = addrStr.split(',').map(s => s.trim())
      return { address: parts[0] || '', city: parts[1] || '' }
    }
    return { address: addrStr, city: '' }
  }

  const prev = addressRows.map((r: any) => ({ 
    id: r.id, 
    address: r.address || '', 
    city: r.city || '',
    // For comparison, combine as "Address, City"
    value: r.city ? `${r.address || ''}, ${r.city}` : (r.address || '')
  }))
  
  const curr = nextAddresses.map(parseAddress)

  const maxLen = Math.max(prev.length, curr.length)

  for (let i = 0; i < maxLen; i++) {
    const prevItem = prev[i]
    const prevId  = prevItem?.id
    const nextItem = curr[i]

    if (prevItem && nextItem) {
      // Check if address or city changed
      const prevCombined = prevItem.city ? `${prevItem.address}, ${prevItem.city}` : prevItem.address
      const nextCombined = nextItem.city ? `${nextItem.address}, ${nextItem.city}` : nextItem.address
      
      if (norm(prevCombined) !== norm(nextCombined)) {
        await database.write(async () => {
          const rec: any = await addressesCollection.find(prevId)
          await rec.update((r: any) => { 
            r.address = nextItem.address
            r.city = nextItem.city
            r.last_modified_at = Date.now()
          })
        })
        await logUpdateCustomerAddress(userId, customerId, prevCombined, nextCombined)
      }
    } else if (!prevItem && nextItem) {
      const parent = await database.get('customers').find(customerId)
      await database.write(async () => {
        await addressesCollection.create((rec: any) => {
          rec.customer.set(parent)        
          rec.address = nextItem.address
          rec.city = nextItem.city
          rec.created_at = Date.now()
          rec.last_modified_at = Date.now()
        })
      })

      const nextCombined = nextItem.city ? `${nextItem.address}, ${nextItem.city}` : nextItem.address
      await logAddCustomerAddress(userId, customerId, nextCombined)
    } else if (prevItem && !nextItem) {
      await database.write(async () => {
        const rec: any = await addressesCollection.find(prevId)
        await rec.destroyPermanently()
      })
      const prevCombined = prevItem.city ? `${prevItem.address}, ${prevItem.city}` : prevItem.address
      await logDeleteCustomerAddress(userId, customerId, prevCombined)
    }
  }
}

export type NewCustomer = {
  firstName: string
  lastName: string
  phone?: string
  address?: string
  city?: string
  afm?: string
  notes?: string
}

// insert customer + phones/address + log
export async function createCustomer(data: NewCustomer, userIdForLog: string = 'system') {
  const customers = database.get('customers')

  let newRecord: any = null

  const afmClean = (data.afm ?? '').trim()
  if (afmClean) {
    const dup = await findCustomerByAfm(afmClean)
    if (dup) {
      throw new Error(`το ΑΦΜ ${afmClean} υπάρχει ήδη.`)
    }
  }

  await database.write(async () => {
    newRecord = await customers.create((rec: any) => {
      rec.firstName       = data.firstName.trim()
      rec.lastName        = data.lastName.trim()
      // Don't store phones/addresses in main customer record - they go to separate tables
      // phone, address, city removed from customers table - they're in separate tables
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

  // Add phones/addresses as individual rows in separate tables
  // Note: data.phone/data.address/data.city may contain pipe-separated values for backward compatibility
  // We split them and create individual rows
  try {
    const phonesList    = splitPipeList(data.phone ?? '').filter(Boolean)
    const addressesList = splitPipeList(data.address ?? '').filter(Boolean)
    const citiesList    = splitPipeList(data.city ?? '').filter(Boolean)
    
    // Use index-based sync to create individual rows (one row per phone/address)
    if (phonesList.length > 0) {
      await syncPhonesWithIndexLogs(userIdForLog, newRecord.id, phonesList)
    }
    
    if (addressesList.length > 0 || citiesList.length > 0) {
      const normalizedEntries = pairAddressCity(addressesList, citiesList)
      await syncAddressesWithIndexLogs(userIdForLog, newRecord.id, normalizedEntries.filter(Boolean))
    }

  } catch (err) {
    console.warn('createCustomer: contacts sync failed:', err)
  }

  // Activity log: CREATE (best-effort)
  try {
    await logCreateCustomer(userIdForLog, newRecord.id, {
      firstName: data.firstName,
      lastName:  data.lastName,
      phone:     data.phone ?? '',
      address:   data.address ?? '',
      city:      data.city ?? '',
      afm:       data.afm ?? '',
      notes:     data.notes ?? '',
    })
    console.log('logCreateCustomer OK')
  } catch (err) {
    console.warn('logCreateCustomer failed:', err)
  }

  return newRecord
}


// live observe - sort by last_modified_at so updates trigger observable
export function observeCustomers(limit = 200) {
  const customers = database.get('customers')
  return customers
    .query(Q.sortBy('last_modified_at', Q.desc), Q.take(limit))
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

  // Step 1: Mark customer and related records as deleted in WatermelonDB
  await database.write(async () => {
    const rec: any = await customers.find(id)

    console.log('[DELETE-DEBUG] Customer BEFORE markAsDeleted:', rec._raw)

    if (!rec) {
      throw new Error(`Customer with id ${id} not found`)
    }

    // Save data for logging before deletion
    deletedData = {
      firstName: rec.firstName,
      lastName:  rec.lastName,
      phone:     '', // Removed from customers table
      address:   '', // Removed from customers table
      afm:       rec.afm,
      notes:     rec.notes,
      createdAt: rec.createdAt,
    }

    // Get related records before marking as deleted
    const phonesCollection = database.get('customer_phones')
    const addressesCollection = database.get('customer_addresses')

    phoneRows = await phonesCollection.query(Q.where('customer_id', id)).fetch()
    addressRows = await addressesCollection.query(Q.where('customer_id', id)).fetch()

    // Mark related records as deleted (for sync)
    // This ensures phone/address deletions are also synced
    for (const r of phoneRows) {
      await r.markAsDeleted()
    }
    for (const r of addressRows) {
      await r.markAsDeleted()
    }

    // Mark customer as deleted (for sync)
    // WatermelonDB will track this deletion and include it in sync
    // When synchronize() is called, it will collect this ID in the 'deleted' array
    await rec.markAsDeleted()

    console.log('[DELETE-DEBUG] Customer AFTER markAsDeleted:', rec._raw)
  })

  // Step 2: Trigger sync immediately to push deletion to server
  // This ensures the deletion is synced right away, not waiting for periodic sync
  try {
    // Small delay to ensure WatermelonDB has processed the deletion
    await new Promise(resolve => setTimeout(resolve, 300))
    
    const { manualSync } = await import('./autoSyncManager')
    const syncResult = await manualSync()
    
    console.log(`[DELETE] Customer ${id} deletion sync result:`, syncResult)
  } catch (syncError) {
    // Don't throw - auto-sync will handle it later
    console.warn('[DELETE] Immediate sync failed, will be handled by auto-sync:', syncError)
  }

  // Step 3: Log the deletion (best-effort, don't block)
  try {
    for (const r of phoneRows) {
      await logDeleteCustomerPhone(userIdForLog, id, r.phone_number)
    }
    for (const r of addressRows) {
      await logDeleteCustomerAddress(userIdForLog, id, r.address)
    }
    await logDeleteCustomer(userIdForLog, id, deletedData)
    console.log(`[DELETE] Customer ${id} deletion logged successfully`)
  } catch (err) {
    console.warn('[DELETE] Logging failed (non-critical):', err)
  }
}


// update customer
export type UpdateCustomer = Partial<{
  firstName: string
  lastName: string
  phone: string
  address: string
  city: string
  afm: string
  notes: string
}>
// update customer + phones/address + log
// update customer + phones/address + log
export async function updateCustomer(id: string, data: UpdateCustomer, userIdForLog: string = 'system') {
  const customers = database.get('customers')

  // ⬇️ ΦΕΡΝΟΥΜΕ ΤΟΝ RECORD ΕΞΩ ΑΠΟ ΤΟ write
  let rec: any
  try {
    rec = await customers.find(id)
    if (!rec) {
      throw new Error(`Customer with id ${id} not found`)
    }
  } catch (err) {
    throw new Error(`Failed to find customer: ${err instanceof Error ? err.message : String(err)}`)
  }

  // ⬇️ ΕΛΕΓΧΟΣ ΔΙΠΛΟΥ ΑΦΜ ΕΞΩ ΑΠΟ ΤΟ write (για να περάσει σωστά το throw στο UI)
  if (typeof data.afm !== 'undefined') {
    const nextAfm = (data.afm ?? '').trim()
    const prevAfm = (rec.afm ?? '').trim()

    if (nextAfm && nextAfm !== prevAfm) {
      const dup = await findCustomerByAfm(nextAfm)
      if (dup && dup.id !== id) {
        throw new Error(`το ΑΦΜ ${nextAfm} υπάρχει ήδη.`)
      }
    }
  }

  let oldValues: any = null
  let newValues: any = null

  try {
    await database.write(async () => {
      // snapshot before
      oldValues = {
        firstName: rec.firstName,
        lastName:  rec.lastName,
        phone:     '', // Removed from customers table
        address:   '', // Removed from customers table
        city:      '', // Removed from customers table
        afm:       rec.afm,
        notes:     rec.notes,
      }
      
      await rec.update((r: any) => {
        if (typeof data.firstName !== 'undefined') {
          r.firstName = data.firstName.trim()
        }
        if (typeof data.lastName  !== 'undefined') {
          r.lastName  = data.lastName.trim()
        }
        // Don't store phones/addresses in main customer record - they go to separate tables
        // Clear them if they were set
        // phone, address, city removed from customers table - they're in separate tables
        if (typeof data.afm       !== 'undefined') {
          r.afm       = data.afm ?? ''
        }
        if (typeof data.notes     !== 'undefined') {
          r.notes     = data.notes ?? ''
        }
        r.lastModifiedAt = Date.now()
      })

      // snapshot after
      newValues = {
        firstName: rec.firstName,
        lastName:  rec.lastName,
        phone:     '', // Removed from customers table
        address:   '', // Removed from customers table
        city:      '', // Removed from customers table
        afm:       rec.afm,
        notes:     rec.notes,
      }
    })
  } catch (dbError) {
    throw new Error(`Failed to update customer in database: ${dbError instanceof Error ? dbError.message : String(dbError)}`)
  }

  // Activity log
  try {
    await logUpdateCustomer(userIdForLog, id, oldValues, newValues)
  } catch (err) {
    console.warn('logUpdateCustomer failed:', err)
  }

  // Note: Phones and addresses are handled separately via syncPhonesWithIndexLogs/syncAddressesWithIndexLogs
  // This function should NOT be called with phone/address data - those should be handled separately
}



// check for duplicates for afm
export async function findCustomerByAfm(afm: string) {
  const customers = database.get('customers')
  const existing = await customers.query(Q.where('afm', afm.trim())).fetch()
  return existing[0] ?? null
}