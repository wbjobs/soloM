import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import blocksRoutes from './routes/blocks.js'
import gasRoutes from './routes/gas.js'
import analyzeRoutes from './routes/analyze.js'
import { securityHeaders, globalRateLimit, requestSizeLimit, sanitizeInput } from './middleware/security.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const app: express.Application = express()

app.use(securityHeaders)
app.use(globalRateLimit)
app.use(requestSizeLimit)

app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true, limit: '2mb' }))

app.use(sanitizeInput)

app.use('/api/blocks', blocksRoutes)
app.use('/api/gas', gasRoutes)
app.use('/api/analyze', analyzeRoutes)

app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', error)
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
