export interface CargoItem {
  id: string
  name: string
  width: number
  height: number
  depth: number
  row: number
  col: number
  x: number
  y: number
  z: number
  timestamp: number
  color: string
}

export interface ShelfCell {
  row: number
  col: number
  occupied: boolean
  cargoId: string | null
}

export interface PendingCargo {
  id: string
  name: string
  width: number
  height: number
  depth: number
  targetRow: number
  targetCol: number
  color: string
  startPos: [number, number, number]
  endPos: [number, number, number]
  progress: number
  timestamp: number
}

export interface OutboundCargo {
  id: string
  name: string
  width: number
  height: number
  depth: number
  color: string
  startPos: [number, number, number]
  endPos: [number, number, number]
  progress: number
  timestamp: number
}

export type ColorMode = 'size' | 'duration'

export interface SelectionRect {
  startX: number
  startY: number
  endX: number
  endY: number
}
