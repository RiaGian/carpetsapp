// services/additems.ts
import { Q } from '@nozbe/watermelondb'
import { database } from '../database/initializeDatabase'

// Models
import OrderItem from '../database/models/OrderItem'
import Shelf from '../database/models/Shelf'
import WarehouseItem from '../database/models/WarehouseItem'

// Αν έχεις activity logs για αυτά, ξεκλείδωσέ τα εδώ:
// import { logPlaceItemOnShelf, logRemoveItemFromShelf, logMoveItemBetweenShelves } from './activitylog'

const now = () => Date.now()

// ——————————————————————————————————
// Helpers
// ——————————————————————————————————
const norm = (v: any) => (v ?? '').toString().trim().toLowerCase()

function matchesQuery(rec: any, q?: string) {
  if (!q) return true
  const s = norm(q)
  const code = norm(rec.item_code)
  const cat  = norm(rec.category)
  const col  = norm(rec.color)
  return code.includes(s) || cat.includes(s) || col.includes(s)
}


export async function loadFreeOrderItems(opts?: { query?: string; limit?: number }) {
  const { query, limit = 200 } = opts ?? {}

  // items id that are free
  const activePlacements = await database.get<WarehouseItem>('warehouse_items')
    .query(Q.where('is_active', true))
    .fetch()
  const busyItemIds = new Set(activePlacements.map((w: any) => w.get('item_id')))

  // order_items =/ warehouse item
  let items = await database.get<OrderItem>('order_items')
    .query(Q.sortBy('created_at', Q.desc))
    .fetch()

  items = items.filter((r: any) => !busyItemIds.has(r.id))
  if (query && query.trim()) items = items.filter((r) => matchesQuery(r as any, query))

  return items.slice(0, limit)
}


export async function loadShelfActiveItems(shelfId: string, opts?: { query?: string }) {
  const { query } = opts ?? {}

  const placements = await database.get<WarehouseItem>('warehouse_items')
    .query(Q.where('shelf_id', shelfId), Q.where('is_active', true))
    .fetch()

  if (placements.length === 0) return []

  const itemIds = placements.map((w: any) => w.get('item_id'))
  const orderItems = await database.get<OrderItem>('order_items')
    .query(Q.where('id', Q.oneOf(itemIds)))
    .fetch()

  const byId = new Map(orderItems.map((o: any) => [o.id, o]))
  const rows = placements
    .map((w: any) => {
      const o = byId.get(w.get('item_id'))
      return o ? { warehouseItem: w, orderItem: o } : null
    })
    .filter(Boolean) as Array<{ warehouseItem: WarehouseItem; orderItem: OrderItem }>

  return query && query.trim()
    ? rows.filter(({ orderItem }) => matchesQuery(orderItem as any, query))
    : rows
}

export async function placeOrderItemOnShelf(input: { itemId: string; shelfId: string; placedAt?: number }) {
  const { itemId, shelfId, placedAt } = input

  return database.write(async () => {
    // Guards
    const item  = await database.get<OrderItem>('order_items').find(itemId)
    const shelf = await database.get<Shelf>('shelves').find(shelfId)

    const activeExisting = await database.get<WarehouseItem>('warehouse_items')
      .query(Q.where('item_id', itemId), Q.where('is_active', true))
      .fetch()
    if (activeExisting.length > 0) {
      throw new Error('Το τεμάχιο είναι ήδη τοποθετημένο σε ράφι.')
    }

    // Create placement 
    const created = await database.get<WarehouseItem>('warehouse_items').create((w: any) => {
      w.order_item.set(item)   // => item_id
      w.shelf.set(shelf)       // => shelf_id
      w.placed_at = placedAt ?? now()
      w.is_active = true
    })

    // Counter +1 on shelf
    await shelf.update((r: any) => {
      const c = Number(r.item_count || 0)
      r.item_count = c + 1
    })

    
    return created
  })
}


export async function removeWarehouseItem(warehouseItemId: string) {
  return database.write(async () => {
    const placement = await database.get<WarehouseItem>('warehouse_items').find(warehouseItemId);
    const shelfId = (placement as any)._raw.shelf_id;

    await placement.update((w: any) => {
      w.is_active = false;
      w.removed_at = now();
    });

    const shelf = await database.get<Shelf>('shelves').find(shelfId);
    await shelf.update((r: any) => {
      const c = Number(r.item_count || 0);
      r.item_count = Math.max(0, c - 1);
    });

    // try { await logRemoveItemFromShelf('system', warehouseItemId) } catch {}
  });
}


