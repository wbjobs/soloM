export interface TileMap {
  id: string
  name: string
  width: number
  height: number
  tileWidth: number
  tileHeight: number
  layers: Layer[]
  events: EventObject[]
  spawnPoint: { x: number; y: number }
  createdAt: string
  updatedAt: string
  version: number
}

export type LayerType = 'terrain' | 'collision' | 'event' | 'ground' | 'objects' | 'sky'

export interface Layer {
  id: string
  name: string
  type: LayerType
  visible: boolean
  locked: boolean
  data: number[]
  order: number
}

export type EventType = 'teleport' | 'npc' | 'chest' | 'trigger' | 'dialog' | 'custom'

export interface DialogLine {
  speaker: string
  text: string
  portrait?: string
}

export interface DialogScript {
  lines: DialogLine[]
  choices?: {
    text: string
    next?: string
    action?: string
  }[]
  flags?: string[]
}

export interface EventObject {
  id: string
  type: EventType
  x: number
  y: number
  properties: Record<string, string>
  script?: DialogScript
  trigger?: 'onCollision' | 'onInteract' | 'onEnter' | 'auto'
}

export interface MapVersion {
  id: string
  mapId: string
  version: number
  snapshot: TileMap
  createdAt: string
  description: string
}

export interface CreateMapRequest {
  name: string
  width: number
  height: number
  tileWidth: number
  tileHeight: number
}

export type EditorTool = 'brush' | 'eraser' | 'fill' | 'select' | 'event'

export type EditorMode = 'edit' | 'run'

export interface EditorState {
  mode: EditorMode
  tool: EditorTool
  selectedTileId: number
  selectedLayerId: string | null
  selectedEventId: string | null
  zoom: number
  cameraX: number
  cameraY: number
  showGrid: boolean
  showCrt: boolean
  undoStack: TileMap[]
  redoStack: TileMap[]
  placingEventType: EventType
  dialogOpen: boolean
  currentDialog: EventObject | null
}
