import { Model } from '@nozbe/watermelondb'
import { date, field, relation } from '@nozbe/watermelondb/decorators'

export default class Pickup extends Model {
  static table = 'pickups'

  // Define relationships
  static associations = {
    customers: { type: 'belongs_to', key: 'customer_id' },
    users: { type: 'belongs_to', key: 'created_by' },
  } as const

  // Relations
  @relation('customers', 'customer_id') customer!: any
  @relation('users', 'created_by') createdBy!: any

  // Fields
  @field('pickup_date') pickupDate!: string // ISO datetime string
  @field('pickup_time_start') pickupTimeStart?: string // HH:mm format
  @field('pickup_time_end') pickupTimeEnd?: string // HH:mm format
  @field('notes') notes?: string
  @date('created_at') createdAt!: number
  @date('last_modified_at') lastModifiedAt!: number
}

