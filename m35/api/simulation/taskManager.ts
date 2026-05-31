export interface SimulationTask {
  taskId: string
  fileName: string
  status: 'uploaded' | 'running' | 'completed' | 'failed'
  atomCount: number
  residueCount: number
  steps: number
  forceField: string
  temperature: number
  finalEnergy?: number
  trajectoryPath?: string
  minimizedPdbPath?: string
  createdAt: number
  completedAt?: number
}

export interface EnergyRecord {
  step: number
  energy: number
}

const tasks = new Map<string, SimulationTask>()
const energies = new Map<string, EnergyRecord[]>()

export function createTask(task: SimulationTask): void {
  tasks.set(task.taskId, task)
  energies.set(task.taskId, [])
}

export function getTask(taskId: string): SimulationTask | undefined {
  return tasks.get(taskId)
}

export function updateTask(taskId: string, updates: Partial<SimulationTask>): void {
  const task = tasks.get(taskId)
  if (task) {
    Object.assign(task, updates)
  }
}

export function addEnergyRecord(taskId: string, record: EnergyRecord): void {
  const records = energies.get(taskId)
  if (records) {
    records.push(record)
  }
}

export function getEnergyRecords(taskId: string): EnergyRecord[] {
  return energies.get(taskId) ?? []
}

export function getAllTasks(): SimulationTask[] {
  return Array.from(tasks.values())
}
