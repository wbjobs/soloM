import { create } from 'zustand'
import type { TileMap, EditorTool, EditorMode, EventObject, Layer, LayerType } from '../../shared/types'

interface EditorStoreState {
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
  placingEventType: EventObject['type'] | null
  currentMap: TileMap | null
  isDirty: boolean
  undoStack: TileMap[]
  redoStack: TileMap[]
}

interface EditorStoreActions {
  setMode: (mode: EditorMode) => void
  setTool: (tool: EditorTool) => void
  setSelectedTileId: (id: number) => void
  setSelectedLayerId: (id: string | null) => void
  setSelectedEventId: (id: string | null) => void
  setZoom: (zoom: number) => void
  setCamera: (x: number, y: number) => void
  toggleGrid: () => void
  toggleCrt: () => void
  setPlacingEventType: (type: EventObject['type'] | null) => void
  setCurrentMap: (map: TileMap | null) => void
  updateMapData: (updater: (map: TileMap) => TileMap) => void
  markDirty: () => void
  markClean: () => void
  pushUndo: () => void
  undo: () => void
  redo: () => void
  addLayer: (data: { name: string; type: LayerType }) => void
  updateLayer: (layerId: string, updates: Partial<Layer>) => void
  deleteLayer: (layerId: string) => void
  reorderLayer: (layerId: string, newOrder: number) => void
}

const MAX_UNDO = 50

export const useEditorStore = create<EditorStoreState & EditorStoreActions>()((set, get) => ({
  mode: 'edit',
  tool: 'brush',
  selectedTileId: 1,
  selectedLayerId: null,
  selectedEventId: null,
  zoom: 1,
  cameraX: 0,
  cameraY: 0,
  showGrid: true,
  showCrt: false,
  placingEventType: null,
  currentMap: null,
  isDirty: false,
  undoStack: [],
  redoStack: [],

  setMode: (mode) => set({ mode }),
  setTool: (tool) => set({ tool }),
  setSelectedTileId: (id) => set({ selectedTileId: id }),
  setSelectedLayerId: (id) => set({ selectedLayerId: id }),
  setSelectedEventId: (id) => set({ selectedEventId: id }),
  setZoom: (zoom) => set({ zoom: Math.max(0.25, Math.min(4, zoom)) }),
  setCamera: (x, y) => set({ cameraX: x, cameraY: y }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleCrt: () => set((s) => ({ showCrt: !s.showCrt })),
  setPlacingEventType: (type) => set({ placingEventType: type }),
  setCurrentMap: (map) => set({ currentMap: map, isDirty: false, undoStack: [], redoStack: [] }),
  updateMapData: (updater) =>
    set((s) => {
      if (!s.currentMap) return s
      return { currentMap: updater(s.currentMap), isDirty: true }
    }),
  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),

  pushUndo: () =>
    set((s) => {
      if (!s.currentMap) return s
      const stack = [...s.undoStack, structuredClone(s.currentMap)].slice(-MAX_UNDO)
      return { undoStack: stack, redoStack: [] }
    }),

  undo: () =>
    set((s) => {
      if (!s.currentMap || s.undoStack.length === 0) return s
      const stack = [...s.undoStack]
      const prev = stack.pop()!
      return {
        undoStack: stack,
        redoStack: [...s.redoStack, structuredClone(s.currentMap)],
        currentMap: prev,
        isDirty: true,
      }
    }),

  redo: () =>
    set((s) => {
      if (!s.currentMap || s.redoStack.length === 0) return s
      const stack = [...s.redoStack]
      const next = stack.pop()!
      return {
        redoStack: stack,
        undoStack: [...s.undoStack, structuredClone(s.currentMap)],
        currentMap: next,
        isDirty: true,
      }
    }),

  addLayer: (data) =>
    set((s) => {
      if (!s.currentMap) return s
      const newLayer: Layer = {
        id: crypto.randomUUID(),
        name: data.name,
        type: data.type,
        visible: true,
        locked: false,
        data: new Array(s.currentMap.width * s.currentMap.height).fill(0),
        order: s.currentMap.layers.length,
      }
      return {
        currentMap: {
          ...s.currentMap,
          layers: [...s.currentMap.layers, newLayer],
        },
        selectedLayerId: newLayer.id,
        isDirty: true,
      }
    }),

  updateLayer: (layerId, updates) =>
    set((s) => {
      if (!s.currentMap) return s
      return {
        currentMap: {
          ...s.currentMap,
          layers: s.currentMap.layers.map((l) =>
            l.id === layerId ? { ...l, ...updates } : l
          ),
        },
        isDirty: true,
      }
    }),

  deleteLayer: (layerId) =>
    set((s) => {
      if (!s.currentMap) return s
      const layer = s.currentMap.layers.find((l) => l.id === layerId)
      if (!layer || layer.type === 'collision') return s
      const newLayers = s.currentMap.layers
        .filter((l) => l.id !== layerId)
        .map((l, i) => ({ ...l, order: i }))
      return {
        currentMap: {
          ...s.currentMap,
          layers: newLayers,
        },
        selectedLayerId: s.selectedLayerId === layerId ? newLayers[0]?.id ?? null : s.selectedLayerId,
        isDirty: true,
      }
    }),

  reorderLayer: (layerId, newOrder) =>
    set((s) => {
      if (!s.currentMap) return s
      const layers = [...s.currentMap.layers]
      const layerIndex = layers.findIndex((l) => l.id === layerId)
      if (layerIndex === -1) return s
      const [layer] = layers.splice(layerIndex, 1)
      layers.splice(newOrder, 0, layer)
      const reindexedLayers = layers.map((l, i) => ({ ...l, order: i }))
      return {
        currentMap: {
          ...s.currentMap,
          layers: reindexedLayers,
        },
        isDirty: true,
      }
    }),
}))
