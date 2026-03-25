import { Model } from '@nozbe/watermelondb'
import { date, field, relation } from '@nozbe/watermelondb/decorators'

export default class OrderItem extends Model {
  static table = 'order_items'

  @relation('orders', 'order_id') order!: any
  
  @field('item_code') item_code?: string
  @field('category') category?: string
  @field('color') color?: string
  @field('price') price!: number
  @field('status') status!: string
  @field('storage_status') storage_status?: string
  @field('order_date') order_date?: string
  @field('length_m') length_m?: string
  @field('width_m') width_m?: string
  @field('area_m2') area_m2?: string
  @field('price_per_m2') price_per_m2?: string
  @date('created_at') created_at!: number
}
