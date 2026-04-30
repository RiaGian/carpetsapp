import { Q } from '@nozbe/watermelondb'
import { database } from '../database/initializeDatabase'

export async function seedUsers() {
  const users = database.get('users')

  await database.write(async () => {
    // 1) ensure "system" (fixed id)
    try {
      await users.find('system')
      console.log('ℹ️ User "system" υπάρχει ήδη')
    } catch {
      await users.create((u: any) => {
        u._raw.id = 'system'
        u.email = 'system@example.com'
        u.password_hash = 'placeholder' // προσωρινό
        u.name = 'System User'
        u.created_at = Date.now()
      })
      console.log('✅ Δημιουργήθηκε ο user "system"')
    }

    // 2) ensure admin by email
    const existing = await users.query(Q.where('email', 'admin@example.com')).fetch()
    if (existing.length === 0) {
      await users.create((u: any) => {
        u.email = 'admin@example.com'
        u.password_hash = '1234' // προσωρινό (χωρίς hash)
        u.name = 'Georgia'
        u.created_at = Date.now()
      })
      console.log('✅ Δημιουργήθηκε ο admin user')
    } else {
      console.log('ℹ️ Admin user υπάρχει ήδη')
    }
  })
}
