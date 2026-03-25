import { Model } from '@nozbe/watermelondb'
import { children, field } from '@nozbe/watermelondb/decorators'

export default class Customer extends Model {
  static table = 'customers'

  //  1→N relation : @children(...)
  static associations = {
    orders:             { type: 'has_many',  foreignKey: 'customer_id' },
    customer_phones:    { type: 'has_many',  foreignKey: 'customer_id' },
    customer_addresses: { type: 'has_many',  foreignKey: 'customer_id' },
  } as const

  @field('first_name') firstName!: string
  @field('last_name') lastName!: string
  @field('phone') phone!: string
  @field('address') address!: string
  @field('city') city!: string 
  @field('afm') afm!: string
  @field('notes') notes!: string
  @field('created_at') createdAt!: number
  @field('last_modified_at') lastModifiedAt!: number

  @children('orders') orders!: any
  @children('customer_phones') phones!: any
  @children('customer_addresses') addresses!: any
}
