import cors from 'cors'
import express from 'express'

const app = express()
app.use(cors())
app.use(express.json())

// users - mock
//let users = [
//  { id: 1, name: 'Georgia Demo', email: 'demo@carpets.app', passwordHash: '1234' },
//  { id: 2, name: 'Maria Example', email: 'user@example.com', passwordHash: 'abcd' },
//]

//Log endpoint 
app.post('/api/log', (req, res) => {
  const { event, payload } = req.body || {}
  const serverTs = new Date().toISOString()
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress

  console.log('LOG EVENT:', event, {
    ...payload,
    serverTs,
    ip,
  })

  res.json({ ok: true })
})

//Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {}
  const found = users.find(u => u.email === email && u.passwordHash === password)
  if (!found) return res.status(401).json({ ok: false, message: 'Λάθος στοιχεία' })
  return res.json({
    ok: true,
    token: 'mock-jwt-token',
    user: { id: found.id, name: found.name, email: found.email },
  })
})

//Users listing (dev)
app.get('/api/users', (_req, res) => res.json(users))

const PORT = 4000
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`))
