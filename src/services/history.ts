import { Q } from '@nozbe/watermelondb'
import { database } from '../database/initializeDatabase'

export type HistoryFilters = {
  search?: string        
  yearFrom?: number|null 
  yearTo?: number|null   
  category?: string|null // items
  status?: string|null   // items
  storageStatus?: string|null  // items
  customerId?: string|null
  orderIds?: string[]           
  limit?: number     

  
}

/* Helpers */
const norm = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()



/**  (ISO string fields: YYYY-MM-DD) */
function dateRangeClauses(field: string, yearFrom?: number|null, yearTo?: number|null) {
  const clauses: any[] = []
  if (yearFrom) clauses.push(Q.where(field, Q.gte(`${yearFrom}-01-01`)))
  if (yearTo)   clauses.push(Q.where(field, Q.lte(`${yearTo}-12-31`)))
  return clauses
}

/*  ORDERS */

export type HistoryOrder = {
  id: string
  orderDate: string
  totalAmount: number
  deposit: number
  notes: string
  paymentMethod: string
  customerId: string | null
  customerName: string | null
  createdAt: number
  order_status?: string
  hasDebt: boolean
}

export async function listHistoryOrders(filters: HistoryFilters = {}) : Promise<HistoryOrder[]> {
  const limit = filters.limit ?? 200
  const orders = database.get('orders')

  const clauses: any[] = [
    ...dateRangeClauses('order_date', filters.yearFrom ?? null, filters.yearTo ?? null),
    Q.sortBy('created_at', Q.desc),
  ]

  if (filters.customerId) {
    clauses.unshift(Q.where('customer_id', filters.customerId))
  }

  // filtering  orderIds from items
  if (filters.orderIds && filters.orderIds.length > 0) {
    const uniqueIds = Array.from(new Set(filters.orderIds))
    try {
      //  DB-level filtering
      clauses.unshift(Q.where('id', Q.oneOf(uniqueIds as any)))
    } catch {
      // fallback in JS after fetch
    }
  } else {
    // ΝΟ orderIds --> limit in query
    clauses.push(Q.take(limit))
  }

  // search (notes / paymentMethod)
  if (filters.search && filters.search.trim()) {
    const q = `%${filters.search.trim()}%`
    clauses.unshift(
      Q.or(
        Q.where('notes', Q.like(q)),
        Q.where('payment_method', Q.like(q))
      )
    )
  }

  let rows: any[] = await orders.query(...clauses).fetch()

  // Fallback
  if (filters.orderIds && filters.orderIds.length > 0) {
    const set = new Set(filters.orderIds)
    rows = rows.filter(r => set.has(r.id))
    //  soft limit
    if (rows.length > limit) rows = rows.slice(0, limit)
  }


  // best-effort resolve customer name
  const customers = database.get('customers')
  const out: HistoryOrder[] = []
  for (const r of rows) {
    // Προσπάθησε να βρεις με κάθε πιθανό τρόπο το customer_id
    const custId: string | null =
      r.customer?.id ??
      r.customer_id ??
      r.customerId ??
      r._raw?.customer_id ??
      null

    let customerName: string | null = null
    try {
      const cm: any = custId ? await customers.find(custId) : null
      if (cm) {
        const fn = (cm.firstName ?? cm.firstname ?? cm._raw?.first_name ?? '').trim()
        const ln = (cm.lastName ?? cm.lastname ?? cm._raw?.last_name ?? '').trim()
        customerName = `${fn} ${ln}`.trim() || null
      }
    } catch { /* ignore */ }

    out.push({
      id: r.id,
      orderDate: r.orderDate ?? r.order_date ?? r._raw?.order_date ?? '',
      totalAmount: r.totalAmount ?? r.total_amount ?? r._raw?.total_amount ?? 0,
      deposit: r.deposit ?? r._raw?.deposit ?? 0,
      notes: r.notes ?? r._raw?.notes ?? '',
      paymentMethod: r.paymentMethod ?? r.payment_method ?? r._raw?.payment_method ?? '',
      customerId: custId,
      customerName, 
      createdAt: r.createdAt ?? r.created_at ?? r._raw?.created_at ?? Date.now(),
      order_status: r.orderStatus ?? r.order_status ?? r._raw?.order_status ?? r.status ?? '',
      hasDebt: (r.hasDebt ?? r.has_debt ?? r._raw?.has_debt ?? false) as boolean, 
    })
  }
  return out


}


/*  ORDER ITEMS  */

export type HistoryItem = {
  id: string
  orderId: string | null
  item_code: string
  category: string
  color: string
  price: number
  status: string
  storage_status: string
  order_date: string
  created_at: number
}

export async function listHistoryItems(filters: HistoryFilters = {}) : Promise<HistoryItem[]> {
  const limit = filters.limit ?? 200
  const items = database.get('order_items')

  const clauses: any[] = [
    ...dateRangeClauses('order_date', filters.yearFrom ?? null, filters.yearTo ?? null),
    Q.sortBy('created_at', Q.desc),
    Q.take(limit),
  ]

  if (filters.category && filters.category !== 'Όλες') {
    clauses.unshift(Q.where('category', filters.category))
  }
  if (filters.status && filters.status !== 'Όλα') {
    clauses.unshift(Q.where('status', filters.status))
  }
  if (filters.storageStatus) {
    clauses.unshift(Q.where('storage_status', filters.storageStatus))
  }

  if (filters.search && filters.search.trim()) {
    const q = `%${filters.search.trim()}%`
    clauses.unshift(
      Q.or(
        Q.where('item_code', Q.like(q)),
        Q.where('category', Q.like(q)),
        Q.where('color', Q.like(q))
      )
    )
  }

  let rows: any[] = await items.query(...clauses).fetch()

  // 🔸 helper: πάρε το order_id με σιγουριά (raw ή relation)
  const getOrderId = (r: any): string | null =>
    r.order_id ?? r.order?.id ?? r._raw?.order_id ?? null

  // ✅ 1) Αν έχω συγκεκριμένα orderIds (δηλ. αυτά που προβάλλονται στα Orders)
  if (filters.orderIds && filters.orderIds.length > 0) {
    const setOrderIds = new Set(filters.orderIds)
    rows = rows.filter((r: any) => {
      const oid = getOrderId(r)
      return oid ? setOrderIds.has(oid) : false
    })
  }
  // ✅ 2) Fallback: μόνο με customerId (όταν δεν δόθηκαν orderIds)
  else if (filters.customerId) {
    const orders = database.get('orders')
    const setOrderIds = new Set(
      (await orders
        .query(Q.where('customer_id', filters.customerId))
        .fetch()).map((o: any) => o.id)
    )
    rows = rows.filter((r: any) => {
      const oid = getOrderId(r)
      return oid ? setOrderIds.has(oid) : false
    })
  }

  return rows.map((r: any) => ({
    id: r.id,
    orderId: getOrderId(r),
    item_code: r.item_code ?? '',
    category: r.category ?? '',
    color: r.color ?? '',
    price: r.price ?? 0,
    status: r.status ?? '',
    storage_status: r.storage_status ?? '',
    order_date: r.order_date ?? '',
    created_at: r.created_at,
  }))
}

/* CUSTOMERS */

export type HistoryCustomer = {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  address: string | null
  afm: string | null
  createdAt: number
}

export async function listHistoryCustomers(filters: HistoryFilters = {}) : Promise<HistoryCustomer[]> {
  const limit = filters.limit ?? 200
  const customers = database.get('customers')

  const clauses: any[] = [
    Q.sortBy('created_at', Q.desc),
    Q.take(limit),
  ]

  // search
  if (filters.search && filters.search.trim()) {
    const q = `%${filters.search.trim()}%`
    clauses.unshift(
      Q.or(
        Q.where('first_name', Q.like(q)),
        Q.where('last_name', Q.like(q)),
        Q.where('phone', Q.like(q)),
        Q.where('address', Q.like(q)),
        Q.where('notes', Q.like(q)),
      )
    )
  }

  const rows: any[] = await customers.query(...clauses).fetch()

  const yearFrom = filters.yearFrom ?? null
  const yearTo   = filters.yearTo ?? null
  const customerId = filters.customerId ?? null

  return rows
    .filter((r: any) => {
      if (customerId && r.id !== customerId) return false
      if (!yearFrom && !yearTo) return true
      const y = new Date(r.createdAt).getFullYear()
      if (yearFrom && y < yearFrom) return false
      if (yearTo && y > yearTo) return false
      return true
    })
    .map((r: any) => ({
      id: r.id,
      firstName: r.firstName || '',
      lastName: r.lastName || '',
      phone: r.phone || null,
      address: r.address || null,
      afm: r.afm || null,
      createdAt: r.createdAt,
    }))
}
