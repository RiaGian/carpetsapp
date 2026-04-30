import { Model } from '@nozbe/watermelondb'
import { children, date, field, relation } from '@nozbe/watermelondb/decorators'

export default class Order extends Model {
  static table = 'orders'

  @relation('customers', 'customer_id') customer!: any
  @relation('users', 'created_by') createdBy!: any
  @children('order_items') items!: any

  @field('payment_method') paymentMethod!: string
  @field('deposit') deposit!: number
  @field('total_amount') totalAmount!: number
  @field('notes') notes?: string
  @field('order_date') orderDate!: string
  @date('created_at') createdAt!: number
  @date('last_modified_at') lastModifiedAt!: number
}