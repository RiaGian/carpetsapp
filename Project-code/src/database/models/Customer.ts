import { Model } from '@nozbe/watermelondb'
import { children, field } from '@nozbe/watermelondb/decorators'

export default class Customer extends Model {
  static table = 'customers'

  @field('first_name') firstName!: string
  @field('last_name') lastName!: string
  @field('phone') phone!: string
  @field('address') address!: string
  @field('afm') afm!: string
  @field('notes') notes!: string
  @field('created_at') createdAt!: number
  @field('last_modified_at') lastModifiedAt!: number

  @children('orders') orders!: any
  @children('customer_phones') phones!: any
  @children('customer_addresses') addresses!: any
}