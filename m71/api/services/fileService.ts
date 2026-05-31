import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface DicomFileInfo {
  id: string
  filename: string
  size: number
  uploadedAt: string
}

const uploadsDir = path.join(__dirname, 'uploads')

export { uploadsDir }

const writeQueue: Map<string, Promise<any>> = new Map()

async function ensureUploadsDir(): Promise<void> {
  await fs.mkdir(uploadsDir, { recursive: true })
}

async function enqueueWrite(id: string, writeFn: () => Promise<void>): Promise<void> {
  const existing = writeQueue.get(id)
  if (existing) {
    await existing
  }

  const promise = (async () => {
    try {
      await writeFn()
    } finally {
      writeQueue.delete(id)
    }
  })()

  writeQueue.set(id, promise)
  await promise
}

const globalLock = {
  _active: false,
  _queue: [] as Array<() => void>,

  async acquire(): Promise<void> {
    if (!this._active) {
      this._active = true
      return
    }
    return new Promise((resolve) => {
      this._queue.push(resolve)
    })
  },

  release(): void {
    if (this._queue.length > 0) {
      const next = this._queue.shift()
      next?.()
    } else {
      this._active = false
    }
  }
}

export async function saveFile(file: Express.Multer.File): Promise<DicomFileInfo> {
  await ensureUploadsDir()

  const id = path.parse(file.filename).name
  const info: DicomFileInfo = {
    id,
    filename: file.originalname,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  }

  await enqueueWrite(id, async () => {
    const tempPath = path.join(uploadsDir, `${id}.json.tmp`)
    const finalPath = path.join(uploadsDir, `${id}.json`)

    await globalLock.acquire()
    try {
      await fs.writeFile(tempPath, JSON.stringify(info, null, 2))
      await fs.rename(tempPath, finalPath)
    } finally {
      globalLock.release()
    }
  })

  return info
}

export async function listFiles(): Promise<DicomFileInfo[]> {
  await ensureUploadsDir()

  await globalLock.acquire()
  try {
    const entries = await fs.readdir(uploadsDir)
    const jsonFiles = entries.filter((e) => e.endsWith('.json'))
    const files: DicomFileInfo[] = []

    for (const jf of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(uploadsDir, jf), 'utf-8')
        const parsed = JSON.parse(content) as DicomFileInfo
        const dcmPath = path.join(uploadsDir, `${parsed.id}.dcm`)

        try {
          await fs.access(dcmPath)
          files.push(parsed)
        } catch {
          await fs.unlink(path.join(uploadsDir, jf)).catch(() => {})
        }
      } catch {
      }
    }

    return files
  } finally {
    globalLock.release()
  }
}

export function getFilePath(id: string): string | null {
  const candidate = path.join(uploadsDir, `${id}.dcm`)
  const resolved = path.resolve(candidate)
  if (resolved.startsWith(path.resolve(uploadsDir))) {
    return candidate
  }
  return null
}

export async function deleteFile(id: string): Promise<boolean> {
  const jsonPath = path.join(uploadsDir, `${id}.json`)

  try {
    await fs.access(jsonPath)
  } catch {
    return false
  }

  await enqueueWrite(id, async () => {
    await globalLock.acquire()
    try {
      const dcmPath = path.join(uploadsDir, `${id}.dcm`)
      const dcmTmpPath = path.join(uploadsDir, `${id}.dcm.deleting`)
      const jsonTmpPath = path.join(uploadsDir, `${id}.json.deleting`)

      try {
        await fs.rename(dcmPath, dcmTmpPath)
        await fs.unlink(dcmTmpPath)
      } catch {
      }

      try {
        await fs.rename(jsonPath, jsonTmpPath)
        await fs.unlink(jsonTmpPath)
      } catch {
      }
    } finally {
      globalLock.release()
    }
  })

  return true
}
