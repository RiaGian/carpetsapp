import { BASE_URL } from './config'

export async function loginApi(email: string, password: string) {
  console.log('Προσπάθεια login με:', email)

  try {
    const url = `${BASE_URL}/login`
    console.log(`Σύνδεση με API στο: ${url}`) 

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    console.log('Status:', res.status)

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error(' Σφάλμα login:', err)
      throw new Error(err?.message || 'Αποτυχία σύνδεσης')
    }

    const data = await res.json()
    console.log('Επιτυχές login:', data)
    return data as {
      ok: boolean
      token: string
      user: { id: number; name: string; email: string }
    }
  } catch (error) {
    console.error('Εξαίρεση στο loginApi:', error)
    throw error
  }
}
