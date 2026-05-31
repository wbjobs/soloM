import { Router, type Request, type Response } from 'express'
import * as mapService from '../services/mapService.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const maps = await mapService.getAllMaps()
    res.json({ success: true, data: maps })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to list maps' })
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const map = await mapService.createMap(req.body)
    res.status(201).json({ success: true, data: map })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create map' })
  }
})

router.post('/import', async (req: Request, res: Response): Promise<void> => {
  try {
    const map = await mapService.importMap(req.body)
    res.status(201).json({ success: true, data: map })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to import map' })
  }
})

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const map = await mapService.getMapById(req.params.id)
    res.json({ success: true, data: map })
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ success: false, error: 'Map not found' })
      return
    }
    res.status(500).json({ success: false, error: 'Failed to get map' })
  }
})

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const map = await mapService.updateMap(req.params.id, req.body)
    res.json({ success: true, data: map })
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ success: false, error: 'Map not found' })
      return
    }
    res.status(500).json({ success: false, error: 'Failed to update map' })
  }
})

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await mapService.deleteMap(req.params.id)
    res.json({ success: true, data: null })
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ success: false, error: 'Map not found' })
      return
    }
    res.status(500).json({ success: false, error: 'Failed to delete map' })
  }
})

router.post('/:id/duplicate', async (req: Request, res: Response): Promise<void> => {
  try {
    const map = await mapService.duplicateMap(req.params.id)
    res.status(201).json({ success: true, data: map })
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ success: false, error: 'Map not found' })
      return
    }
    res.status(500).json({ success: false, error: 'Failed to duplicate map' })
  }
})

router.get('/:id/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const map = await mapService.exportMap(req.params.id)
    res.json({ success: true, data: map })
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ success: false, error: 'Map not found' })
      return
    }
    res.status(500).json({ success: false, error: 'Failed to export map' })
  }
})

router.post('/:id/layers', async (req: Request, res: Response): Promise<void> => {
  try {
    const layer = await mapService.addLayer(req.params.id, req.body)
    res.status(201).json({ success: true, data: layer })
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ success: false, error: 'Map not found' })
      return
    }
    res.status(500).json({ success: false, error: 'Failed to add layer' })
  }
})

router.put('/:id/layers/:layerId', async (req: Request, res: Response): Promise<void> => {
  try {
    const layer = await mapService.updateLayer(req.params.id, req.params.layerId, req.body)
    res.json({ success: true, data: layer })
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ success: false, error: 'Map not found' })
      return
    }
    if (error.message === 'Layer not found') {
      res.status(404).json({ success: false, error: 'Layer not found' })
      return
    }
    res.status(500).json({ success: false, error: 'Failed to update layer' })
  }
})

router.delete('/:id/layers/:layerId', async (req: Request, res: Response): Promise<void> => {
  try {
    await mapService.deleteLayer(req.params.id, req.params.layerId)
    res.json({ success: true, data: null })
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ success: false, error: 'Map not found' })
      return
    }
    if (error.message === 'Layer not found') {
      res.status(404).json({ success: false, error: 'Layer not found' })
      return
    }
    if (error.message === 'Cannot delete collision layer') {
      res.status(400).json({ success: false, error: 'Cannot delete collision layer' })
      return
    }
    res.status(500).json({ success: false, error: 'Failed to delete layer' })
  }
})

router.put('/:id/layers-order', async (req: Request, res: Response): Promise<void> => {
  try {
    const layers = await mapService.reorderLayers(req.params.id, req.body.orders)
    res.json({ success: true, data: layers })
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ success: false, error: 'Map not found' })
      return
    }
    res.status(500).json({ success: false, error: 'Failed to reorder layers' })
  }
})

export default router
