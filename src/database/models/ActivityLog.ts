import { Model } from '@nozbe/watermelondb'
import { field, relation } from '@nozbe/watermelondb/decorators'

export default class ActivityLog extends Model {
  static table = 'activity_logs'

  @field('user_id') userId!: string          
  @relation('users', 'user_id') user!: any 

  @field('action') action!: string
  @field('details') details!: string
  @field('category') category!: string
  @field('status') status!: string
  @field('timestamp') timestamp!: string
}