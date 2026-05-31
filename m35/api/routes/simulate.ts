import { Router, type Request, type Response } from 'express'
import { getTask, updateTask, getEnergyRecords } from '../simulation/taskManager.js'
import { runSimulation } from '../simulation/runner.js'

const router = Router()

const MAX_SSE_RECORDS_PER_UPDATE = 10

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId, steps, forceField, temperature } = req.body

    if (!taskId) {
      res.status(400).json({ success: false, error: 'taskId is required' })
      return
    }

    const task = getTask(taskId)
    if (!task) {
      res.status(404).json({ success: false, error: 'Task not found' })
      return
    }

    if (task.status === 'running') {
      res.status(409).json({ success: false, error: 'Simulation already running' })
      return
    }

    updateTask(taskId, {
      steps: steps ?? task.steps,
      forceField: forceField ?? task.forceField,
      temperature: temperature ?? task.temperature,
    })

    const updatedTask = getTask(taskId)!

    res.status(200).json({
      taskId: updatedTask.taskId,
      status: updatedTask.status,
      steps: updatedTask.steps,
      forceField: updatedTask.forceField,
      temperature: updatedTask.temperature,
    })

    runSimulation(taskId, () => {}).catch((err) => {
      console.error(`Simulation ${taskId} failed:`, err.message)
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/:taskId/progress', (req: Request, res: Response): void => {
  const { taskId } = req.params

  const task = getTask(taskId)
  if (!task) {
    res.status(404).json({ success: false, error: 'Task not found' })
    return
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })

  req.socket.setTimeout(0)

  let lastStep = 0
  let lastSentTime = 0
  const MIN_SSE_INTERVAL_MS = 100

  const sendUpdate = () => {
    const current = getTask(taskId)
    if (!current) return

    const now = Date.now()
    const records = getEnergyRecords(taskId)
    const newRecords = records.slice(lastStep)

    if (newRecords.length === 0 && current.status === 'running') {
      return
    }

    if (now - lastSentTime < MIN_SSE_INTERVAL_MS && current.status === 'running') {
      return
    }

    let sampled: typeof newRecords
    if (newRecords.length > MAX_SSE_RECORDS_PER_UPDATE) {
      const step = newRecords.length / MAX_SSE_RECORDS_PER_UPDATE
      sampled = []
      for (let i = 0; i < MAX_SSE_RECORDS_PER_UPDATE; i++) {
        sampled.push(newRecords[Math.floor(i * step)])
      }
      const last = newRecords[newRecords.length - 1]
      if (sampled[sampled.length - 1] !== last) {
        sampled.push(last)
      }
    } else {
      sampled = newRecords
    }

    for (const record of sampled) {
      res.write(`data: ${JSON.stringify({
        type: 'progress',
        step: record.step,
        energy: record.energy,
        progress: Math.min(100, Math.round((record.step / current.steps) * 100)),
        totalSteps: current.steps,
      })}\n\n`)
    }

    lastStep = records.length
    lastSentTime = now

    if (current.status === 'completed') {
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        taskId: current.taskId,
        finalEnergy: current.finalEnergy,
        minimizedPdbUrl: `/uploads/${taskId}/minimized.pdb`,
      })}\n\n`)
      clearInterval(interval)
      res.end()
    } else if (current.status === 'failed') {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        taskId: current.taskId,
        error: 'Simulation failed',
      })}\n\n`)
      clearInterval(interval)
      res.end()
    }
  }

  const interval = setInterval(sendUpdate, 300)
  sendUpdate()

  req.on('close', () => {
    clearInterval(interval)
  })
})

export default router
