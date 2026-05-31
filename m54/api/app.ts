import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import { setupSocketIO } from './socket/handlers.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.use('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ success: true, message: 'ok' })
})

app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'API not found' })
})

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ success: false, error: 'Server internal error' })
})

const httpServer = createServer(app)

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})

setupSocketIO(io)

export { app, httpServer, io }
