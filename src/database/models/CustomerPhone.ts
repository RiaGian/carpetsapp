import { Model } from '@nozbe/watermelondb'
import { date, field, relation } from '@nozbe/watermelondb/decorators'

export default class CustomerPhone extends Model {
  static table = 'customer_phones'

  @relation('customers', 'customer_id') customer!: any
  
  @field('phone_number') phone_number!: string
  @date('created_at') created_at!: number
}