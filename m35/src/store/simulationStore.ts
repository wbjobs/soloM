import { create } from 'zustand'

export interface EnergyRecord {
  step: number
  energy: number
}

interface SimulationState {
  taskId: string | null
  fileName: string | null
  atomCount: number
  residueCount: number
  status: 'idle' | 'uploaded' | 'running' | 'completed' | 'failed'
  steps: number
  forceField: string
  temperature: number
  energies: EnergyRecord[]
  currentStep: number
  currentEnergy: number | null
  isSimulating: boolean
  minimizedPdbUrl: string | null
  trajectoryUrl: string | null
  startTime: number | null
}

interface SimulationActions {
  setFileInfo: (info: { taskId: string; fileName: string; atomCount: number; residueCount: number }) => void
  startSimulation: () => void
  updateProgress: (step: number, energy: number) => void
  batchUpdateProgress: (records: EnergyRecord[]) => void
  completeSimulation: (minimizedPdbUrl: string, trajectoryUrl: string) => void
  reset: () => void
  setParams: (params: { forceField?: string; steps?: number; temperature?: number }) => void
}

const initialState: SimulationState = {
  taskId: null,
  fileName: null,
  atomCount: 0,
  residueCount: 0,
  status: 'idle',
  steps: 1000,
  forceField: 'AMBER14',
  temperature: 300,
  energies: [],
  currentStep: 0,
  currentEnergy: null,
  isSimulating: false,
  minimizedPdbUrl: null,
  trajectoryUrl: null,
  startTime: null,
}

const MAX_DISPLAY_POINTS = 500

function downsampleEnergies(energies: EnergyRecord[]): EnergyRecord[] {
  if (energies.length <= MAX_DISPLAY_POINTS) return energies
  const step = energies.length / MAX_DISPLAY_POINTS
  const sampled: EnergyRecord[] = []
  for (let i = 0; i < MAX_DISPLAY_POINTS; i++) {
    sampled.push(energies[Math.floor(i * step)])
  }
  const last = energies[energies.length - 1]
  if (sampled[sampled.length - 1] !== last) {
    sampled.push(last)
  }
  return sampled
}

export const useSimulationStore = create<SimulationState & SimulationActions>((set, get) => ({
  ...initialState,

  setFileInfo: (info) =>
    set({
      taskId: info.taskId,
      fileName: info.fileName,
      atomCount: info.atomCount,
      residueCount: info.residueCount,
      status: 'uploaded',
      energies: [],
      currentStep: 0,
      currentEnergy: null,
      minimizedPdbUrl: null,
      trajectoryUrl: null,
    }),

  startSimulation: () =>
    set({
      status: 'running',
      isSimulating: true,
      energies: [],
      currentStep: 0,
      currentEnergy: null,
      startTime: Date.now(),
    }),

  updateProgress: (step, energy) => {
    const state = get()
    const newEnergies = state.energies
    newEnergies.push({ step, energy })
    set({
      currentStep: step,
      currentEnergy: energy,
    })
  },

  batchUpdateProgress: (records) => {
    const state = get()
    const newEnergies = state.energies
    for (const r of records) {
      newEnergies.push(r)
    }
    if (records.length > 0) {
      const last = records[records.length - 1]
      set({
        currentStep: last.step,
        currentEnergy: last.energy,
      })
    }
  },

  completeSimulation: (minimizedPdbUrl, trajectoryUrl) =>
    set({
      status: 'completed',
      isSimulating: false,
      minimizedPdbUrl,
      trajectoryUrl,
    }),

  reset: () => set(initialState),

  setParams: (params) =>
    set((state) => ({
      ...state,
      ...params,
    })),
}))

export { downsampleEnergies, MAX_DISPLAY_POINTS }
