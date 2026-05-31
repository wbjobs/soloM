import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { getTask, updateTask, addEnergyRecord, getEnergyRecords } from './taskManager.js'
import { broadcastToTask, broadcastBinaryToTask } from '../ws/manager.js'
import type { SimulationTask } from './taskManager.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MAX_SIMULATION_TIME_MS = 10 * 60 * 1000
const SSE_SAMPLE_INTERVAL = 20

function parsePdbCoordinates(pdbPath: string): Float64Array {
  const content = fs.readFileSync(pdbPath, 'utf-8')
  const coords: number[] = []
  for (const line of content.split('\n')) {
    if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
      const x = parseFloat(line.substring(30, 38))
      const y = parseFloat(line.substring(38, 46))
      const z = parseFloat(line.substring(46, 54))
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        coords.push(x, y, z)
      }
    }
  }
  return new Float64Array(coords)
}

type ProgressCallback = (data: { step: number; energy: number; progress: number }) => void

async function checkOpenMM(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('python', ['-c', 'import simtk.openmm as mm; print("ok")'])
    proc.on('error', () => resolve(false))
    proc.on('close', (code) => resolve(code === 0))
  })
}

function runOpenMM(
  task: SimulationTask,
  pdbPath: string,
  onProgress: ProgressCallback,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'minimize.py')
    const outputDir = path.join(__dirname, '..', '..', 'uploads', task.taskId)
    const args = [
      scriptPath,
      '--pdb', pdbPath,
      '--steps', String(task.steps),
      '--force-field', task.forceField,
      '--output-dir', outputDir,
    ]

    const proc = spawn('python', args)
    let stderr = ''

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error(`Simulation timed out after ${MAX_SIMULATION_TIME_MS / 1000}s`))
    }, MAX_SIMULATION_TIME_MS)

    let lastReportedStep = 0
    const originalCoords = parsePdbCoordinates(pdbPath)
    let prevCoords = new Float64Array(originalCoords)

    proc.stdout.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          if (parsed.type === 'energy') {
            addEnergyRecord(task.taskId, { step: parsed.step, energy: parsed.energy })

            if (parsed.step - lastReportedStep >= SSE_SAMPLE_INTERVAL || parsed.step === task.steps) {
              onProgress({
                step: parsed.step,
                energy: parsed.energy,
                progress: Math.min(100, Math.round((parsed.step / task.steps) * 100)),
              })
              lastReportedStep = parsed.step
            }
          } else if (parsed.type === 'coordinates') {
            const newCoords = new Float64Array(parsed.positions)
            broadcastCoordFrame(task.taskId, parsed.step, originalCoords, newCoords, prevCoords)
            prevCoords = new Float64Array(newCoords)
          } else if (parsed.type === 'complete') {
            updateTask(task.taskId, {
              status: 'completed',
              finalEnergy: parsed.final_energy,
              minimizedPdbPath: path.join(outputDir, 'minimized.pdb'),
              completedAt: Date.now(),
            })
          }
        } catch {
          // ignore non-JSON lines
        }
      }
    })

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    proc.on('close', (code) => {
      clearTimeout(timeout)
      if (code !== 0) {
        reject(new Error(`OpenMM process exited with code ${code}: ${stderr}`))
      } else {
        resolve()
      }
    })
  })
}

function broadcastCoordFrame(
  taskId: string,
  step: number,
  originalCoords: Float64Array,
  newCoords: Float64Array,
  prevCoords: Float64Array,
) {
  const atomCount = newCoords.length / 3
  const isLarge = atomCount > 5000

  if (isLarge) {
    const deltaSize = newCoords.length
    const buffer = Buffer.alloc(8 + 8 + deltaSize * 4)
    buffer.writeUInt32LE(step, 0)
    buffer.writeUInt32LE(atomCount, 4)
    buffer.writeDoubleLE(0, 8)

    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    for (let i = 0; i < newCoords.length; i++) {
      view.setFloat32(16 + i * 4, newCoords[i] - originalCoords[i], true)
    }

    broadcastBinaryToTask(taskId, buffer)
  } else {
    broadcastToTask(taskId, {
      type: 'coordinates',
      step,
      atomCount,
      positions: Array.from(newCoords),
    })
  }
}

function runMock(
  task: SimulationTask,
  pdbPath: string,
  onProgress: ProgressCallback,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const originalCoords = parsePdbCoordinates(pdbPath)
    const atomCount = originalCoords.length / 3
    const atomFactor = atomCount / 100
    const baseEnergy = -(5000 + atomFactor * 45000)
    const decayRate = 3 / task.steps
    const totalSteps = task.steps
    const isLargeMolecule = atomCount > 5000

    const reportInterval = isLargeMolecule
      ? Math.max(1, Math.floor(totalSteps / 20))
      : Math.max(1, Math.floor(totalSteps / 50))

    const coordInterval = isLargeMolecule
      ? Math.max(reportInterval * 2, Math.floor(totalSteps / 50))
      : Math.max(reportInterval, Math.floor(totalSteps / 100))

    const perturbationScale = isLargeMolecule ? 0.15 : 0.3

    const perturbations = new Float64Array(originalCoords.length)
    for (let i = 0; i < perturbations.length; i++) {
      perturbations[i] = (Math.random() - 0.5) * perturbationScale
    }

    let currentStep = 0
    const startTime = Date.now()

    const writeStream = fs.createWriteStream(
      path.join(__dirname, '..', '..', 'uploads', task.taskId, 'energies.json'),
    )
    writeStream.write('[\n')
    let firstRecord = true

    const interval = setInterval(() => {
      const endStep = Math.min(currentStep + reportInterval, totalSteps)

      for (let step = currentStep + 1; step <= endStep; step++) {
        const t = step / totalSteps
        const energy = baseEnergy * (1 - Math.exp(-decayRate * step)) - baseEnergy * 0.1 * t
        const noise = (Math.random() - 0.5) * Math.abs(baseEnergy) * 0.005
        const finalEnergy = energy + noise

        addEnergyRecord(task.taskId, { step, energy: finalEnergy })

        if (!firstRecord) writeStream.write(',\n')
        writeStream.write(JSON.stringify({ step, energy: finalEnergy }))
        firstRecord = false

        if (step % coordInterval === 0 || step === totalSteps) {
          const decay = Math.exp(-3 * t)
          const currentCoords = new Float64Array(originalCoords.length)
          for (let i = 0; i < originalCoords.length; i++) {
            const pertDecay = perturbations[i] * decay
            const microMotion = (Math.random() - 0.5) * 0.02 * decay
            currentCoords[i] = originalCoords[i] + pertDecay + microMotion
          }

          broadcastCoordFrame(task.taskId, step, originalCoords, currentCoords, originalCoords)
        }

        if (step % reportInterval === 0 || step === totalSteps) {
          onProgress({
            step,
            energy: finalEnergy,
            progress: Math.min(100, Math.round((step / totalSteps) * 100)),
          })
        }
      }

      currentStep = endStep

      if (Date.now() - startTime > MAX_SIMULATION_TIME_MS) {
        clearInterval(interval)
        writeStream.write('\n]', () => {
          writeStream.end()
        })
        reject(new Error('Simulation timed out'))
        return
      }

      if (currentStep >= totalSteps) {
        clearInterval(interval)

        const records = getEnergyRecords(task.taskId)
        const finalEnergy = records.length > 0 ? records[records.length - 1].energy : baseEnergy
        const outputDir = path.join(__dirname, '..', '..', 'uploads', task.taskId)

        writeStream.write('\n]', () => {
          writeStream.end()
        })

        const minimizedPath = path.join(outputDir, 'minimized.pdb')
        if (fs.existsSync(pdbPath)) {
          fs.copyFileSync(pdbPath, minimizedPath)
        }

        updateTask(task.taskId, {
          status: 'completed',
          finalEnergy,
          minimizedPdbPath: minimizedPath,
          completedAt: Date.now(),
        })

        resolve()
      }
    }, isLargeMolecule ? 100 : 50)
  })
}

export async function runSimulation(
  taskId: string,
  onProgress: ProgressCallback,
): Promise<void> {
  const task = getTask(taskId)
  if (!task) {
    throw new Error(`Task ${taskId} not found`)
  }

  const pdbPath = path.join(__dirname, '..', '..', 'uploads', taskId, 'original.pdb')

  updateTask(taskId, { status: 'running' })

  try {
    const hasOpenMM = await checkOpenMM()
    if (hasOpenMM) {
      await runOpenMM(task, pdbPath, onProgress)
    } else {
      console.log('OpenMM not found, using mock runner')
      await runMock(task, pdbPath, onProgress)
    }
  } catch (err: any) {
    updateTask(taskId, { status: 'failed', completedAt: Date.now() })
    throw err
  }
}
