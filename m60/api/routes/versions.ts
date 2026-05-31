import { Router, type Request, type Response } from 'express'
import * as versionService from '../services/versionService.js'

const router = Router()

router.get('/:id/versions', async (req: Request, res: Response): Promise<void> => {
  try {
    const versions = await versionService.getVersions(req.params.id)
    res.json({ success: true, data: versions })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to list versions' })
  }
})

router.post('/:id/versions', async (req: Request, res: Response): Promise<void> => {
  try {
    const version = await versionService.createVersion(req.params.id, req.body.description)
    res.status(201).json({ success: true, data: version })
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ success: false, error: 'Map not found' })
      return
    }
    res.status(500).json({ success: false, error: 'Failed to create version' })
  }
})

router.post('/:id/versions/:versionId/rollback', async (req: Request, res: Response): Promise<void> => {
  try {
    const version = await versionService.rollbackVersion(req.params.id, req.params.versionId)
    res.json({ success: true, data: version })
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ success: false, error: 'Version not found' })
      return
    }
    res.status(500).json({ success: false, error: 'Failed to rollback version' })
  }
})

export default router
