import { Q } from '@nozbe/watermelondb'
import { database } from '../database/initializeDatabase'
import { logMoveItemToShelf, logRemoveItemFromShelf, logTransferItemShelf } from './activitylog'

type CommonIds = { userId?: string }
type AssignOpts = CommonIds & { orderItemId: string; shelfId: string }
type RemoveOpts = CommonIds & { orderItemId: string } 
type TransferOpts = CommonIds & { orderItemId: string; toShelfId: string }

export type WarehouseListItem = {
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
  shelf_code?: string // προαιρετικό για εμφάνιση
}

export async function assignItemToShelf({ orderItemId, shelfId, userId = 'system' }: AssignOpts) {
  const shelvesColl = database.get('shelves')
  const witemsColl  = database.get('warehouse_items')
  const orderItems  = database.get('order_items')

  let shelfCode = ''

  await database.write(async () => {
    // validations
    const shelf = await shelvesColl.find(shelfId)
    const item  = await orderItems.find(orderItemId)

    shelfCode = (shelf as any).code || ''

    // μην τοποθετήσεις διπλά
    const already = await witemsColl
      .query(Q.where('is_active', true), Q.where('item_id', orderItemId), Q.take(1))
      .fetch()
    if (already.length) throw new Error('Το τεμάχιο είναι ήδη σε ράφι.')

    // χωρητικότητα (προαιρετικό)
    const cap = Number((shelf as any).capacity ?? 0)
    const cnt = Number((shelf as any).item_count ?? 0)
    if (cap > 0 && cnt >= cap) throw new Error('Το ράφι έχει φτάσει τη χωρητικότητα.')

    // δημιουργία τοποθέτησης
    await witemsColl.create((r: any) => {
      r.item_id   = item.id
      r.shelf_id  = shelf.id
      r.placed_at = Date.now()
      r.is_active = true
    })

    // ++ item_count
    await shelf.update((s: any) => { s.item_count = Number(s.item_count ?? 0) + 1 })
  })

  // log
  try { await logMoveItemToShelf(userId, orderItemId, shelfId, shelfCode) } catch {}

  return true
}

export async function removeItemFromShelf({ orderItemId, userId = 'system' }: RemoveOpts) {
  const shelvesColl = database.get('shelves')
  const witemsColl  = database.get('warehouse_items')

  let shelfId = ''
  let shelfCode = ''

  await database.write(async () => {
    const active = await witemsColl
      .query(Q.where('is_active', true), Q.where('item_id', orderItemId), Q.take(1))
      .fetch()

    if (!active.length) throw new Error('Το τεμάχιο δεν είναι σε ράφι.')

    const rec: any = active[0]
    shelfId = rec._raw.shelf_id

    // fetch shelf για count & code
    const shelf = await shelvesColl.find(shelfId)
    shelfCode = (shelf as any).code || ''

    // κάνε inactive
    await rec.update((r: any) => {
      r.is_active = false
      r.removed_at = Date.now()
    })

    // -- item_count
    await shelf.update((s: any) => { s.item_count = Math.max(0, Number(s.item_count ?? 0) - 1) })
  })

  // log
  try { await logRemoveItemFromShelf(userId, orderItemId, shelfId, shelfCode) } catch {}

  return true
}


export async function transferItemShelf({ orderItemId, toShelfId, userId = 'system' }: TransferOpts) {
  const shelvesColl = database.get('shelves')
  const witemsColl  = database.get('warehouse_items')

  let fromShelfId = ''
  let fromShelfCode = ''
  let toShelfCode = ''

  await database.write(async () => {
    // βρες τρέχουσα ενεργή τοποθέτηση
    const active = await witemsColl
      .query(Q.where('is_active', true), Q.where('item_id', orderItemId), Q.take(1))
      .fetch()

    if (!active.length) {
      // αν δεν υπάρχει, αντιμετώπισέ το σαν απλή assign
      await assignItemToShelf({ orderItemId, shelfId: toShelfId, userId })
      return
    }

    const rec: any = active[0]
    fromShelfId = rec._raw.shelf_id

    if (fromShelfId === toShelfId) return // τίποτα να κάνουμε

    const fromShelf = await shelvesColl.find(fromShelfId)
    const toShelf   = await shelvesColl.find(toShelfId)

    fromShelfCode = (fromShelf as any).code || ''
    toShelfCode   = (toShelf as any).code   || ''

    // χωρητικότητα στον στόχο
    const cap = Number((toShelf as any).capacity ?? 0)
    const cnt = Number((toShelf as any).item_count ?? 0)
    if (cap > 0 && cnt >= cap) throw new Error('Το ράφι-στόχος έχει φτάσει τη χωρητικότητα.')

    // κλείσε την παλιά
    await rec.update((r: any) => { r.is_active = false; r.removed_at = Date.now() })
    await fromShelf.update((s: any) => { s.item_count = Math.max(0, Number(s.item_count ?? 0) - 1) })

    // άνοιξε νέα
    await witemsColl.create((r: any) => {
      r.item_id   = orderItemId
      r.shelf_id  = toShelfId
      r.placed_at = Date.now()
      r.is_active = true
    })
    await toShelf.update((s: any) => { s.item_count = Number(s.item_count ?? 0) + 1 })
  })

  // log
  try { await logTransferItemShelf(userId, orderItemId, fromShelfId, toShelfId) } catch {}
  // (προαιρετικά, και move log προς τον προορισμό — αλλά ήδη έχουμε transfer)

  return true
}

export async function listActiveItemsOnShelf(shelfId: string): Promise<WarehouseListItem[]> {
  const witemsColl   = database.get('warehouse_items')
  const itemsColl    = database.get('order_items')
  const ordersColl   = database.get('orders')
  const customersColl= database.get('customers')
  const shelvesColl  = database.get('shelves')

  // items on shelves
  const placements = await witemsColl
    .query(Q.where('is_active', true), Q.where('shelf_id', shelfId))
    .fetch()
  if (!placements.length) return []

  const itemIds = placements.map((w: any) => w._raw.item_id).filter(Boolean)
  if (!itemIds.length) return []

  // shelf code
  let shelfCode: string | undefined
  try {
    const shelf: any = await shelvesColl.find(shelfId)
    shelfCode = shelf?.code
  } catch {}

  // order_items
  const rows: any[] = await itemsColl
    .query(Q.where('id', Q.oneOf(itemIds)))
    .fetch()

  const getOrderId = (r: any): string | null =>
    r.order_id ?? r.order?.id ?? r._raw?.order_id ?? null

  // batch orders
  const orderIds = Array.from(new Set(rows.map(getOrderId).filter(Boolean))) as string[]
  let ordersById = new Map<string, any>()
  if (orderIds.length) {
    const orderRows: any[] = await ordersColl.query(Q.where('id', Q.oneOf(orderIds))).fetch()
    ordersById = new Map(orderRows.map((o: any) => [o.id, o]))
  }

  // batch customers
  const customerIds = Array.from(new Set(orderIds.map(oid => {
    const o: any = ordersById.get(oid)
    return o?.customer?.id ?? o?.customer_id ?? o?._raw?.customer_id ?? null
  }).filter(Boolean))) as string[]
  let customersById = new Map<string, any>()
  if (customerIds.length) {
    const customerRows: any[] = await customersColl.query(Q.where('id', Q.oneOf(customerIds))).fetch()
    customersById = new Map(customerRows.map((c: any) => [c.id, c]))
  }

  // build output
  return rows.map((r: any) => {
    const order_id = getOrderId(r)
    let customer_id: string | null = null
    let customer_name: string | null = null
    if (order_id) {
      const o: any = ordersById.get(order_id)
      customer_id = o?.customer?.id ?? o?.customer_id ?? o?._raw?.customer_id ?? null
      if (customer_id) {
        const c: any = customersById.get(customer_id)
        const fn = (c?.firstName ?? c?.firstname ?? c?._raw?.first_name ?? '').trim()
        const ln = (c?.lastName  ?? c?.lastname  ?? c?._raw?.last_name  ?? '').trim()
        customer_name = `${fn} ${ln}`.trim() || null
      }
    }
    return {
      id: r.id,
      order_id,
      customer_id,
      customer_name,
      item_code: r.item_code ?? '',
      category: r.category ?? '',
      color: r.color ?? '',
      price: Number(r.price ?? 0),
      status: r.status ?? '',
      storage_status: r.storage_status ?? '',
      order_date: r.order_date ?? '',
      created_at: Number(r.created_at ?? r._raw?.created_at ?? Date.now()),
      shelf_code: shelfCode,
    }
  })
}

export async function listAllActiveWarehouseItems(): Promise<WarehouseListItem[]> {
  const witemsColl   = database.get('warehouse_items')
  const itemsColl    = database.get('order_items')
  const ordersColl   = database.get('orders')
  const customersColl= database.get('customers')
  const shelvesColl  = database.get('shelves')

  // 1) Ενεργές τοποθετήσεις
  const placements = await witemsColl.query(Q.where('is_active', true)).fetch()
  if (!placements.length) return []

  // Map για γρήγορο lookup: item_id -> placement
  const placementByItemId = new Map<string, any>()
  for (const p of placements as any[]) {
    const itemId = String(p._raw.item_id)
    // αν «κατά λάθος» υπάρχουν 2 ενεργά, κρατάμε το πιο πρόσφατο placed_at
    const prev = placementByItemId.get(itemId)
    if (!prev || Number(p._raw.placed_at || 0) > Number(prev._raw?.placed_at || 0)) {
      placementByItemId.set(itemId, p)
    }
  }

  const itemIds = Array.from(new Set(placements.map((w: any) => String(w._raw.item_id)).filter(Boolean)))
  const shelfIds = Array.from(new Set(placements.map((w: any) => String(w._raw.shelf_id)).filter(Boolean)))

  // 2) Ράφια
  const shelfRows: any[] = shelfIds.length
    ? await shelvesColl.query(Q.where('id', Q.oneOf(shelfIds))).fetch()
    : []
  const shelvesById = new Map<string, any>(shelfRows.map((s: any) => [String(s.id), s]))

  // 3) order_items
  const rows: any[] = itemIds.length
    ? await itemsColl.query(Q.where('id', Q.oneOf(itemIds))).fetch()
    : []
  if (!rows.length) return []

  // 4) orders & customers (batch)
  const getOrderId = (r: any): string | null =>
    r.order_id ?? r.order?.id ?? r._raw?.order_id ?? null

  const orderIds = Array.from(new Set(rows.map(getOrderId).filter(Boolean))) as string[]
  const orderRows: any[] = orderIds.length
    ? await ordersColl.query(Q.where('id', Q.oneOf(orderIds))).fetch()
    : []
  const ordersById = new Map(orderRows.map((o: any) => [String(o.id), o]))

  const customerIds = Array.from(new Set(orderIds.map(oid => {
    const o: any = ordersById.get(String(oid))
    return o?.customer?.id ?? o?.customer_id ?? o?._raw?.customer_id ?? null
  }).filter(Boolean))) as string[]

  const customerRows: any[] = customerIds.length
    ? await customersColl.query(Q.where('id', Q.oneOf(customerIds))).fetch()
    : []
  const customersById = new Map(customerRows.map((c: any) => [String(c.id), c]))

  // 5) Build αποτέλεσμα
  return rows.map((r: any) => {
    const order_id = getOrderId(r)
    let customer_id: string | null = null
    let customer_name: string | null = null

    if (order_id) {
      const o: any = ordersById.get(String(order_id))
      customer_id = o?.customer?.id ?? o?.customer_id ?? o?._raw?.customer_id ?? null
      if (customer_id) {
        const c: any = customersById.get(String(customer_id))
        const fn = (c?.firstName ?? c?.firstname ?? c?._raw?.first_name ?? '').trim()
        const ln = (c?.lastName  ?? c?.lastname  ?? c?._raw?.last_name  ?? '').trim()
        const name = `${fn} ${ln}`.trim()
        customer_name = name || null
      }
    }

    const placement = placementByItemId.get(String(r.id))
    const shelfId   = placement ? String((placement._raw as any).shelf_id) : undefined
    const shelfCode = shelfId ? (shelvesById.get(shelfId)?.code as string | undefined) : undefined

    return {
      id: r.id,
      order_id: order_id ?? null,
      customer_id,
      customer_name,
      item_code: r.item_code ?? '',
      category: r.category ?? '',
      color: r.color ?? '',
      price: Number(r.price ?? 0),
      status: r.status ?? '',               // από order_items
      storage_status: r.storage_status ?? '', // από order_items
      order_date: r.order_date ?? '',
      created_at: Number(r.created_at ?? r._raw?.created_at ?? Date.now()),
      shelf_code: shelfCode,                // string | undefined
    } as WarehouseListItem
  })
}


