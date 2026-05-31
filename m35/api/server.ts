import { createServer } from 'http'
import app from './app.js'
import { WebSocketServer } from 'ws'
import { initWebSocket, getWss } from './ws/manager.js'

const PORT = process.env.PORT || 3001

const server = createServer(app)

const wss = new WebSocketServer({ server, path: '/ws/simulate' })
initWebSocket(wss)

server.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`)
})

server.timeout = 600000
server.keepAliveTimeout = 650000
server.headersTimeout = 660000

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received')
  const wssInstance = getWss()
  wssInstance.clients.forEach((ws) => ws.close())
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT signal received')
  const wssInstance = getWss()
  wssInstance.clients.forEach((ws) => ws.close())
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

export default app
