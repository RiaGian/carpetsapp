import { Model } from '@nozbe/watermelondb'
import { children, date, field, relation } from '@nozbe/watermelondb/decorators'

export default class Order extends Model {
  static table = 'orders'

  // belongs_to & has_many --> relation/children
  static associations = {
    customers:   { type: 'belongs_to', key: 'customer_id' },
    users:       { type: 'belongs_to', key: 'created_by' },
    order_items: { type: 'has_many',   foreignKey: 'order_id' }, 
  } as const

  @relation('customers', 'customer_id') customer!: any
  @relation('users', 'created_by') createdBy!: any
  @children('order_items') items!: any  
  @field('payment_method') paymentMethod!: string
  @field('deposit') deposit!: number
  @field('total_amount') totalAmount!: number
  @field('notes') notes?: string
  @field('order_date') orderDate!: string
  @field('order_status') orderStatus!: string
  @field('has_debt') hasDebt!: boolean
  @date('created_at') createdAt!: number
  @date('last_modified_at') lastModifiedAt!: number
}
