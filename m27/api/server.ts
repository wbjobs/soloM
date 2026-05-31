import { createServer } from 'http'
import { Server } from 'socket.io'
import app from './app.js'

const PORT = process.env.PORT || 3001

const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})

const rooms = new Map<string, Set<string>>()

io.on('connection', (socket) => {
  console.log(`[连接] ${socket.id}`)

  socket.on('create-room', () => {
    const roomId = generateRoomId()
    rooms.set(roomId, new Set([socket.id]))
    socket.join(roomId)
    socket.data.roomId = roomId
    socket.emit('room-created', { roomId })
    console.log(`[房间] 创建 ${roomId} by ${socket.id}`)
  })

  socket.on('join-room', ({ roomId }: { roomId: string }) => {
    const room = rooms.get(roomId)
    if (!room) {
      socket.emit('error', { message: '房间不存在' })
      return
    }
    if (room.size >= 2) {
      socket.emit('error', { message: '房间已满' })
      return
    }
    room.add(socket.id)
    socket.join(roomId)
    socket.data.roomId = roomId
    socket.emit('room-joined', { roomId })
    socket.to(roomId).emit('peer-joined', { peerId: socket.id })
    console.log(`[房间] ${socket.id} 加入 ${roomId}`)
  })

  socket.on('offer', ({ roomId, sdp }: { roomId: string; sdp: RTCSessionDescriptionInit }) => {
    socket.to(roomId).emit('offer', { sdp })
  })

  socket.on('answer', ({ roomId, sdp }: { roomId: string; sdp: RTCSessionDescriptionInit }) => {
    socket.to(roomId).emit('answer', { sdp })
  })

  socket.on('ice-candidate', ({ roomId, candidate }: { roomId: string; candidate: RTCIceCandidateInit }) => {
    socket.to(roomId).emit('ice-candidate', { candidate })
  })

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId
    if (roomId) {
      const room = rooms.get(roomId)
      if (room) {
        room.delete(socket.id)
        if (room.size === 0) {
          rooms.delete(roomId)
        } else {
          socket.to(roomId).emit('peer-left', {})
        }
      }
    }
    console.log(`[断开] ${socket.id}`)
  })
})

function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  if (rooms.has(result)) return generateRoomId()
  return result
}

httpServer.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`)
})

process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0))
})

process.on('SIGINT', () => {
  httpServer.close(() => process.exit(0))
})
