import { Model } from '@nozbe/watermelondb'
import { children, date, field } from '@nozbe/watermelondb/decorators'

export default class Shelf extends Model {
  static table = 'shelves'

  @field('code') code!: string
  @field('description') description?: string
  @field('notes') notes?: string
  @date('created_at') created_at!: number
  @date('last_modified_at') last_modified_at!: number

  @children('warehouse_items') warehouse_items!: any
}
