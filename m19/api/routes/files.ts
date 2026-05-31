import { Router, type Request, type Response } from 'express'
import Busboy from 'busboy'
import {
  uploadStreamToIpfs,
  streamFromIpfs,
  resolveMimeType,
} from '../services/ipfs.service.js'
import {
  addFile,
  getFilesWithPins,
  getFileByCid,
  pinFile,
  purchaseReward,
  getPinsByUser,
  deleteFileRecord,
} from '../services/file.service.js'

const router = Router()

function getUserId(req: Request): number | null {
  const h = req.headers['x-user-id']
  if (!h) return null
  const n = Number(h)
  return isNaN(n) ? null : n
}

router.post(
  '/upload',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req)

      const busboy = Busboy({
        headers: req.headers,
        limits: { fileSize: 2 * 1024 * 1024 * 1024 },
      })

      let uploadPromise: Promise<{ cid: string; size: number }> | null = null
      let fileName = ''
      let fileMime = ''
      let fileSize = 0
      let hasFile = false

      busboy.on(
        'file',
        (name, stream, info) => {
          hasFile = true
          fileName = info.filename || 'file'
          fileMime = info.mimeType || ''

          stream.on('data', (chunk) => {
            fileSize += chunk.length
          })

          uploadPromise = uploadStreamToIpfs(stream, fileName).catch(
            (err) => {
              stream.resume()
              throw err
            },
          )
        },
      )

      busboy.on('error', (err: any) => {
        if (!res.headersSent) {
          res
            .status(500)
            .json({ success: false, error: err.message || 'Upload error' })
        }
      })

      busboy.on('close', async () => {
        try {
          if (!hasFile) {
            res
              .status(400)
              .json({ success: false, error: 'No file provided' })
            return
          }
          if (!uploadPromise) {
            res.status(500).json({ success: false, error: 'Upload failed' })
            return
          }

          const uploaded = await uploadPromise
          const mimeType = resolveMimeType(fileName, fileMime)

          const ownerId = userId || 1
          const record = addFile(uploaded.cid, fileName, fileSize, mimeType, ownerId)

          res.status(200).json({ success: true, data: record })
        } catch (err: any) {
          if (!res.headersSent) {
            res
              .status(500)
              .json({ success: false, error: err.message || 'Upload failed' })
          }
        }
      })

      req.pipe(busboy)
    } catch (err: any) {
      console.error('Upload error:', err)
      res.status(500).json({ success: false, error: err.message || 'Upload failed' })
    }
  },
)

router.get('/files', (req: Request, res: Response): void => {
  const userId = getUserId(req)
  const files = getFilesWithPins(userId ?? undefined)
  res.status(200).json({ success: true, data: { files } })
})

router.get('/file/:cid/info', (req: Request, res: Response): void => {
  const file = getFileByCid(req.params.cid)
  if (!file) {
    res.status(404).json({ success: false, error: 'File not found' })
    return
  }
  res.status(200).json({ success: true, data: file })
})

router.get('/file/:cid', async (req: Request, res: Response): Promise<void> => {
  try {
    const cid = req.params.cid
    const file = getFileByCid(cid)

    const mimeType = file
      ? file.mime_type
      : resolveMimeType(cid, 'application/octet-stream')

    res.setHeader('Content-Type', mimeType)
    res.setHeader('Accept-Ranges', 'bytes')

    if (file) {
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(file.name)}"`,
      )
    }

    const stream = streamFromIpfs(cid)
    for await (const chunk of stream) {
      if (!res.write(chunk)) {
        await new Promise<void>((resolve) => res.once('drain', resolve))
      }
    }
    res.end()
  } catch (err: any) {
    console.error('Download error:', err)
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message || 'Download failed' })
    } else {
      res.end()
    }
  }
})

router.post('/file/:cid/pin', (req: Request, res: Response): void => {
  const userId = getUserId(req)
  if (!userId) {
    res.status(401).json({ success: false, error: '请先登录' })
    return
  }

  const result = pinFile(userId, req.params.cid)
  res.status(result.success ? 200 : 400).json({ success: result.success, ...result })
})

router.post('/file/:cid/reward', (req: Request, res: Response): void => {
  const userId = getUserId(req)
  if (!userId) {
    res.status(401).json({ success: false, error: '请先登录' })
    return
  }

  const level = Number(req.body.level) || 1
  const result = purchaseReward(req.params.cid, userId, level)
  res.status(result.success ? 200 : 400).json({ success: result.success, ...result })
})

router.get('/user/:id/pins', (req: Request, res: Response): void => {
  const pins = getPinsByUser(Number(req.params.id))
  res.status(200).json({ success: true, data: { pins } })
})

router.delete('/file/:cid', (req: Request, res: Response): void => {
  const success = deleteFileRecord(req.params.cid)
  if (!success) {
    res.status(404).json({ success: false, error: 'File not found' })
    return
  }
  res.status(200).json({ success: true })
})

export default router
