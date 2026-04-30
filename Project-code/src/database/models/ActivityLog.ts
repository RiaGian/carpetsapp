import { Model } from '@nozbe/watermelondb'
import { date, field, relation } from '@nozbe/watermelondb/decorators'

export default class ActivityLog extends Model {
  static table = 'activity_logs'

  @relation('users', 'user_id') user!: any

  @field('action') action!: string
  @field('details') details!: string   
  @date('created_at') createdAt!: number
}
