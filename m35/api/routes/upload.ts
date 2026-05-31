import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { fileURLToPath } from 'url'
import { createTask } from '../simulation/taskManager.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const uploadsRoot = path.join(__dirname, '..', '..', 'uploads')

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    const taskId = _req.headers['x-task-id'] as string || uuidv4()
    const taskDir = path.join(uploadsRoot, taskId)
    fs.mkdirSync(taskDir, { recursive: true })
    cb(null, taskDir)
  },
  filename(_req, file, cb) {
    cb(null, 'original.pdb')
  },
})

const upload = multer({
  storage,
  fileFilter(_req, file, cb) {
    if (file.originalname.endsWith('.pdb')) {
      cb(null, true)
    } else {
      cb(new Error('Only .pdb files are allowed'))
    }
  },
})

function parsePdbInfo(content: string): { atomCount: number; residueCount: number } {
  const atoms = new Set<string>()
  const residues = new Set<string>()

  for (const line of content.split('\n')) {
    if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
      const atomSerial = line.substring(6, 11).trim()
      atoms.add(atomSerial)
      const chainId = line.substring(21, 22)
      const resSeq = line.substring(22, 26).trim()
      residues.add(`${chainId}:${resSeq}`)
    }
  }

  return { atomCount: atoms.size, residueCount: residues.size }
}

const router = Router()

router.post(
  '/',
  upload.single('file'),
  (req: Request, res: Response): void => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'No file uploaded' })
        return
      }

      const taskId = path.basename(path.dirname(req.file.path))
      const fileContent = fs.readFileSync(req.file.path, 'utf-8')
      const { atomCount, residueCount } = parsePdbInfo(fileContent)

      createTask({
        taskId,
        fileName: req.file.originalname,
        status: 'uploaded',
        atomCount,
        residueCount,
        steps: 1000,
        forceField: 'amber14-all',
        temperature: 300,
        createdAt: Date.now(),
      })

      res.status(200).json({
        taskId,
        fileName: req.file.originalname,
        atomCount,
        residueCount,
      })
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message })
    }
  },
)

export default router
