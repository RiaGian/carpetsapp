import { Model } from '@nozbe/watermelondb'
import { field, relation } from '@nozbe/watermelondb/decorators'

export default class CustomerAddress extends Model {
  static table = 'customer_addresses'

  @relation('customers', 'customer_id') customer!: any
  @field('address') address!: string
  @field('city') city!: string
  @field('created_at') createdAt!: number
  @field('last_modified_at') lastModifiedAt!: number
}