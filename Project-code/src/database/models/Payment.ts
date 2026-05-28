import { Model } from '@nozbe/watermelondb'
import { date, field, relation } from '@nozbe/watermelondb/decorators'

export default class Payment extends Model {
  static table = 'payments'

  // belongs_to relations
  static associations = {
    orders: { type: 'belongs_to', key: 'order_id' },
    users: { type: 'belongs_to', key: 'created_by' },
  } as const

  @relation('orders', 'order_id') order!: any
  @relation('users', 'created_by') createdBy!: any
  @field('amount') amount!: number
  @field('payment_type') paymentType!: string // 'deposit' | 'partial' | 'full'
  @field('payment_method') paymentMethod?: string
  @field('notes') notes?: string
  @date('created_at') createdAt!: number
}

