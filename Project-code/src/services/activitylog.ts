
import { Q } from '@nozbe/watermelondb'
import { database } from '../database/initializeDatabase'


export async function logActivity(userId: string, action: string, details?: object) {

  // insert to DB (topika/offline)
  const logs = database.get('activity_logs')
  await database.write(async () => {
    await logs.create((entry: any) => {
      entry.user_id = userId
      entry.action = action
      entry.details = details ? JSON.stringify(details) : null
      entry.created_at = Date.now()
    })
  })
}

// insert acitivity_log -- > login
export async function logLogin(userId: string, details?: object) {
  await logActivity(userId, 'login', details)
}

// insert acitivity_log -- > logout
export async function logLogout(userId: string, details?: object) {
  await logActivity(userId, 'logout', details)
}

export async function printActivityLogs(limit = 10) {
  const logs = await database.get('activity_logs')
    .query(Q.sortBy('created_at', Q.desc))
    .fetch()

  console.log(
    'ACTIVITY LOGS:',
    logs.slice(0, limit).map((l: any) => ({
      id: l.id,
      action: l.action,
      details: l.details,
      created_at: new Date(l.createdAt).toLocaleString(),
    }))
  )
}
