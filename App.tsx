import { useEffect } from 'react'
import { initializeDatabase } from './src/database/initializeDatabase'
import { listUsers } from './src/services/users'

export default function App() {
  useEffect(() => {
    (async () => {
      await initializeDatabase()
      const users = await listUsers() 
      console.log('Users:', users.map(u => u._raw)) 
    })()
  }, [])

  return null 
}
