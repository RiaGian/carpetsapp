import { Model } from '@nozbe/watermelondb'
import { field } from '@nozbe/watermelondb/decorators'

export default class User extends Model {
  static table = 'users'

  @field('email') email!: string
  @field('password_hash') password_hash!: string
  @field('name') name!: string
  @field('created_at') created_at!: number
}
