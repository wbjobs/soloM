import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { saveFile, listFiles, getFilePath, deleteFile, uploadsDir } from '../services/fileService.js'

const router = Router()

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir)
  },
  filename: (_req, file, cb) => {
    const id = uuidv4()
    const ext = path.extname(file.originalname) || '.dcm'
    cb(null, `${id}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (ext === '.dcm') {
      cb(null, true)
    } else {
      cb(new Error('Only .dcm files are allowed'))
    }
  },
})

// @ts-ignore
router.post('/upload', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ success: false, error: 'No file uploaded' })
    return
  }
  try {
    const info = await saveFile(req.file)
    res.status(201).json({ success: true, data: info })
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to save file' })
  }
})

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const files = await listFiles()
    res.json({ success: true, data: files })
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to list files' })
  }
})

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const filePath = getFilePath(req.params.id)
  if (!filePath) {
    res.status(404).json({ success: false, error: 'File not found' })
    return
  }
  try {
    const fs = await import('fs/promises')
    await fs.access(filePath)
  } catch {
    res.status(404).json({ success: false, error: 'File not found' })
    return
  }
  res.setHeader('Content-Type', 'application/dicom')
  res.sendFile(filePath)
})

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const deleted = await deleteFile(req.params.id)
    if (!deleted) {
      res.status(404).json({ success: false, error: 'File not found' })
      return
    }
    res.json({ success: true, message: 'File deleted' })
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete file' })
  }
})

export default router
