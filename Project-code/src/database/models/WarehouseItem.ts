import { Model } from '@nozbe/watermelondb'
import { date, field, relation } from '@nozbe/watermelondb/decorators'

export default class WarehouseItem extends Model {
  static table = 'warehouse_items'


  @relation('order_items', 'item_id') order_item!: any
  @relation('shelves', 'shelf_id') shelf!: any


  @field('item_id') item_id!: string
  @field('shelf_id') shelf_id!: string
  @date('placed_at') placed_at!: number
  @date('removed_at') removed_at?: number
  @field('is_active') is_active!: boolean
}
