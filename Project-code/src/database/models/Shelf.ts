import { Model } from '@nozbe/watermelondb'
import { children, field } from '@nozbe/watermelondb/decorators'

export default class Shelf extends Model {
  static table = 'shelves'

  @field('code') code!: string
  @field('barcode') barcode!: string
  @field('floor') floor!: number
  @field('capacity') capacity!: number
  @field('notes') notes?: string
  @field('item_count') item_count!: number
  @field('created_at') created_at!: number

  @children('warehouse_items') warehouse_items!: any
}
