import { Router, type Request, type Response } from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { getTask, getEnergyRecords } from '../simulation/taskManager.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = Router()

router.get('/:taskId', (req: Request, res: Response): void => {
  const { taskId } = req.params

  const task = getTask(taskId)
  if (!task) {
    res.status(404).json({ success: false, error: 'Task not found' })
    return
  }

  const energies = getEnergyRecords(taskId)

  res.status(200).json({
    success: true,
    data: {
      ...task,
      energies,
    },
  })
})

router.get('/minimized/:taskId', (req: Request, res: Response): void => {
  const { taskId } = req.params

  const task = getTask(taskId)
  if (!task) {
    res.status(404).json({ success: false, error: 'Task not found' })
    return
  }

  if (task.status !== 'completed') {
    res.status(400).json({ success: false, error: 'Simulation not completed yet' })
    return
  }

  const minimizedPath = path.join(__dirname, '..', '..', 'uploads', taskId, 'minimized.pdb')

  if (!fs.existsSync(minimizedPath)) {
    res.status(404).json({ success: false, error: 'Minimized PDB file not found' })
    return
  }

  res.sendFile(minimizedPath)
})

export default router
