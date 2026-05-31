import { create } from 'zustand'
import type { CargoItem, ShelfCell, PendingCargo, OutboundCargo, ColorMode } from '@/types'

const ROWS = 10
const COLS = 10
const SHELF_THICKNESS = 0.08
const GAP_BOTTOM = 0.015
const GAP_BETWEEN = 0.008

interface WarehouseStore {
  cells: ShelfCell[][]
  cargos: CargoItem[]
  pendingCargos: PendingCargo[]
  outboundCargos: OutboundCargo[]
  stats: {
    used: number
    total: number
    percentage: number
  }
  colorMode: ColorMode
  selectedCargoIds: Set<string>
  initCells: () => void
  getCargoColor: (width: number, height: number, depth: number) => string
  getDurationColor: (timestamp: number) => string
  findNearestEmptyCell: (searchCells?: ShelfCell[][]) => { row: number; col: number } | null
  addCargo: (name: string, width: number, height: number, depth: number, quantity: number) => {
    success: number
    failed: number
    message: string
  }
  updatePendingCargoProgress: (id: string, progress: number) => void
  finalizePendingCargo: (id: string) => void
  setColorMode: (mode: ColorMode) => void
  toggleCargoSelection: (id: string) => void
  selectCargos: (ids: string[]) => void
  clearSelection: () => void
  removeCargos: (ids: string[]) => void
  addOutboundCargos: (ids: string[]) => void
  finalizeOutboundCargo: (id: string) => void
  calculateStats: (cells: ShelfCell[][]) => {
    used: number
    total: number
    percentage: number
  }
}

const createInitialCells = (): ShelfCell[][] => {
  const cells: ShelfCell[][] = []
  for (let row = 0; row < ROWS; row++) {
    cells[row] = []
    for (let col = 0; col < COLS; col++) {
      cells[row][col] = {
        row,
        col,
        occupied: false,
        cargoId: null,
      }
    }
  }
  return cells
}

const calculateInitialStats = () => ({
  used: 0,
  total: ROWS * COLS,
  percentage: 0,
})

export const useWarehouseStore = create<WarehouseStore>((set, get) => ({
  cells: createInitialCells(),
  cargos: [],
  pendingCargos: [],
  outboundCargos: [],
  stats: calculateInitialStats(),
  colorMode: 'size',
  selectedCargoIds: new Set<string>(),

  calculateStats: (cells: ShelfCell[][]) => {
    let used = 0
    const total = ROWS * COLS
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (cells[row][col].occupied) used++
      }
    }
    return {
      used,
      total,
      percentage: Math.round((used / total) * 100),
    }
  },

  initCells: () => {
    const newCells = createInitialCells()
    set({ cells: newCells, stats: calculateInitialStats() })
  },

  getCargoColor: (width: number, height: number, depth: number) => {
    const volume = width * height * depth
    if (volume < 0.3) return '#00e5a0'
    if (volume < 0.6) return '#ff9500'
    return '#ff6b6b'
  },

  getDurationColor: (timestamp: number) => {
    const elapsed = Date.now() - timestamp
    const minutes = elapsed / 60000
    const t = Math.min(minutes / 5, 1)
    const r = Math.round(0 + t * 255)
    const g = Math.round(229 - t * 185)
    const b = Math.round(160 - t * 60)
    return `rgb(${r},${g},${b})`
  },

  findNearestEmptyCell: (searchCells?: ShelfCell[][]) => {
    const cells = searchCells || get().cells
    const centerRow = Math.floor(ROWS / 2)
    const centerCol = Math.floor(COLS / 2)

    for (let distance = 0; distance < ROWS + COLS; distance++) {
      for (let dRow = -distance; dRow <= distance; dRow++) {
        const dCol = distance - Math.abs(dRow)
        const rows = [centerRow + dRow, centerRow - dRow]
        const cols = [centerCol + dCol, centerCol - dCol]

        for (const row of rows) {
          for (const col of cols) {
            if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
              if (!cells[row][col].occupied) {
                return { row, col }
              }
            }
          }
        }
      }
    }
    return null
  },

  addCargo: (name: string, width: number, height: number, depth: number, quantity: number) => {
    const { cells, findNearestEmptyCell, getCargoColor } = get()
    let successCount = 0
    const newPendingCargos: PendingCargo[] = []
    const newCells = cells.map(row => row.map(cell => ({ ...cell })))

    for (let i = 0; i < quantity; i++) {
      const cell = findNearestEmptyCell(newCells)
      if (!cell) break

      const id = `cargo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const color = getCargoColor(width, height, depth)

      const colOffset = cell.col - COLS / 2 + 0.5
      const layer = Math.floor(cell.row / 2)
      const colInLayer = cell.row % 2
      const x = colOffset + (Math.random() - 0.5) * GAP_BETWEEN
      const y = layer * 1.2 + SHELF_THICKNESS + GAP_BOTTOM + height / 2
      const z = (colInLayer === 0 ? -1 : 1) * 0.6 + (Math.random() - 0.5) * GAP_BETWEEN * 0.5

      const arcHeight = y + height + 2
      const startX = x + (Math.random() - 0.5) * 25
      const startY = Math.max(arcHeight + 3, y + 12)
      const startZ = z + (Math.random() - 0.5) * 25

      const pending: PendingCargo = {
        id,
        name,
        width,
        height,
        depth,
        targetRow: cell.row,
        targetCol: cell.col,
        color,
        startPos: [startX, startY, startZ],
        endPos: [x, y, z],
        progress: 0,
        timestamp: Date.now(),
      }

      newCells[cell.row][cell.col] = {
        ...newCells[cell.row][cell.col],
        occupied: true,
        cargoId: id,
      }

      newPendingCargos.push(pending)
      successCount++
    }

    if (successCount > 0) {
      const newStats = get().calculateStats(newCells)
      set(state => ({
        cells: newCells,
        pendingCargos: [...state.pendingCargos, ...newPendingCargos],
        stats: newStats,
      }))
    }

    const failedCount = quantity - successCount
    let message = ''
    if (successCount === quantity) {
      message = `成功入库 ${successCount} 件货物`
    } else if (successCount > 0) {
      message = `成功入库 ${successCount} 件，${failedCount} 件因货架已满失败`
    } else {
      message = '货架已满，无法入库'
    }

    return {
      success: successCount,
      failed: failedCount,
      message,
    }
  },

  updatePendingCargoProgress: (id: string, progress: number) => {
    set(state => ({
      pendingCargos: state.pendingCargos.map(p =>
        p.id === id ? { ...p, progress } : p
      ),
    }))
  },

  finalizePendingCargo: (id: string) => {
    set(state => {
      const pending = state.pendingCargos.find(p => p.id === id)
      if (!pending) return state

      const cargo: CargoItem = {
        id: pending.id,
        name: pending.name,
        width: pending.width,
        height: pending.height,
        depth: pending.depth,
        row: pending.targetRow,
        col: pending.targetCol,
        x: pending.endPos[0],
        y: pending.endPos[1],
        z: pending.endPos[2],
        timestamp: pending.timestamp,
        color: pending.color,
      }

      return {
        cargos: [...state.cargos, cargo],
        pendingCargos: state.pendingCargos.filter(p => p.id !== id),
      }
    })
  },

  setColorMode: (mode: ColorMode) => {
    set({ colorMode: mode })
  },

  toggleCargoSelection: (id: string) => {
    set(state => {
      const newSet = new Set(state.selectedCargoIds)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return { selectedCargoIds: newSet }
    })
  },

  selectCargos: (ids: string[]) => {
    set(state => {
      const newSet = new Set(state.selectedCargoIds)
      ids.forEach(id => newSet.add(id))
      return { selectedCargoIds: newSet }
    })
  },

  clearSelection: () => {
    set({ selectedCargoIds: new Set<string>() })
  },

  removeCargos: (ids: string[]) => {
    set(state => {
      const idSet = new Set(ids)
      const newCells = state.cells.map(row =>
        row.map(cell => {
          if (cell.cargoId && idSet.has(cell.cargoId)) {
            return { ...cell, occupied: false, cargoId: null }
          }
          return cell
        })
      )
      const newCargos = state.cargos.filter(c => !idSet.has(c.id))
      const newSelectedIds = new Set([...state.selectedCargoIds].filter(id => !idSet.has(id)))
      const newStats = get().calculateStats(newCells)
      return {
        cells: newCells,
        cargos: newCargos,
        selectedCargoIds: newSelectedIds,
        stats: newStats,
      }
    })
  },

  addOutboundCargos: (ids: string[]) => {
    const { cargos, removeCargos } = get()
    const idSet = new Set(ids)
    const selectedCargos = cargos.filter(c => idSet.has(c.id))

    const outbounds: OutboundCargo[] = selectedCargos.map(cargo => {
      const endX = cargo.x + (Math.random() - 0.5) * 30
      const endY = cargo.y + 18 + Math.random() * 5
      const endZ = cargo.z + (Math.random() - 0.5) * 30

      return {
        id: cargo.id,
        name: cargo.name,
        width: cargo.width,
        height: cargo.height,
        depth: cargo.depth,
        color: cargo.color,
        startPos: [cargo.x, cargo.y, cargo.z],
        endPos: [endX, endY, endZ],
        progress: 0,
        timestamp: cargo.timestamp,
      }
    })

    removeCargos(ids)

    set(state => ({
      outboundCargos: [...state.outboundCargos, ...outbounds],
    }))
  },

  finalizeOutboundCargo: (id: string) => {
    set(state => ({
      outboundCargos: state.outboundCargos.filter(o => o.id !== id),
    }))
  },
}))
