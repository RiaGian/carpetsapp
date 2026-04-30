import { Q } from '@nozbe/watermelondb';
import { database } from '../database/initializeDatabase';

// Adds a new user to the database — but only if the email doesn’t already exist. 
//If the user already exists, it just returns the existing record.
type NewUser = { email: string; password_hash: string; name: string }

export async function addUserLocal(u: NewUser) {
  const users = database.get('users')
  const exists = await users.query(Q.where('email', u.email)).fetch()
  if (exists.length) return exists[0]
  return await database.write(async () =>
    users.create((r: any) => {
      r.email = u.email
      r.password_hash = u.password_hash
      r.name = u.name
      r.created_at = Date.now()
    })
  )
}

export async function listUsers() {
  const users = database.get('users')
  return await users.query().fetch()
}

//DELETE IN PRODUCTIONN
export async function resetDb() {
  await database.unsafeResetDatabase()
}
