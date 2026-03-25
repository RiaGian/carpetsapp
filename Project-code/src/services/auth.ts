import { Q } from '@nozbe/watermelondb'
import { database } from '../database/initializeDatabase'

export type AuthUser = {
  id: string
  email: string
  name: string
}

export async function signInPlain(email: string, password: string): Promise<AuthUser> {
  const users = database.get('users')
  const rows = await users.query(Q.where('email', email.trim())).fetch()

  if (rows.length === 0) {
    throw new Error('Ο χρήστης δεν βρέθηκε')
  }

  const u: any = rows[0]

  if ((u.password_hash ?? '') !== password) {
    throw new Error('Λάθος κωδικός')
  }

  return { id: u.id, email: u.email, name: u.name }
}
