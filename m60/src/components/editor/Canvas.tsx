import { useRef, useEffect, useCallback } from 'react'
import { useEditorStore } from '@/stores/editorStore'
import { Renderer } from '@/engine/Renderer'
import { TILE_SIZE } from '@/utils/tileset'
import type { EventObject } from '../../../shared/types'

export default function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDrawing = useRef(false)
  const isPanning = useRef(false)
  const lastPanPos = useRef({ x: 0, y: 0 })
  const animFrameRef = useRef(0)
  const hoveredTile = useRef<{ x: number; y: number } | null>(null)

  const currentMap = useEditorStore((s) => s.currentMap)
  const zoom = useEditorStore((s) => s.zoom)
  const cameraX = useEditorStore((s) => s.cameraX)
  const cameraY = useEditorStore((s) => s.cameraY)
  const showGrid = useEditorStore((s) => s.showGrid)
  const showCrt = useEditorStore((s) => s.showCrt)
  const tool = useEditorStore((s) => s.tool)
  const selectedTileId = useEditorStore((s) => s.selectedTileId)
  const selectedLayerId = useEditorStore((s) => s.selectedLayerId)
  const selectedEventId = useEditorStore((s) => s.selectedEventId)
  const placingEventType = useEditorStore((s) => s.placingEventType)
  const setZoom = useEditorStore((s) => s.setZoom)
  const setCamera = useEditorStore((s) => s.setCamera)
  const updateMapData = useEditorStore((s) => s.updateMapData)
  const pushUndo = useEditorStore((s) => s.pushUndo)
  const setSelectedEventId = useEditorStore((s) => s.setSelectedEventId)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    rendererRef.current = new Renderer(canvas)
    return () => {
      rendererRef.current = null
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        canvas.width = width
        canvas.height = height
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const renderer = rendererRef.current
    const canvas = canvasRef.current
    if (!renderer || !canvas) return

    function loop() {
      const map = useEditorStore.getState().currentMap
      if (map && renderer) {
        const state = useEditorStore.getState()
        renderer.renderMap(map, {
          zoom: state.zoom,
          cameraX: state.cameraX,
          cameraY: state.cameraY,
          showGrid: state.showGrid,
          selectedLayerId: state.selectedLayerId,
          selectedEventId: state.selectedEventId,
          hoveredTile: hoveredTile.current,
        })
      }
      animFrameRef.current = requestAnimationFrame(loop)
    }
    animFrameRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [])

  const getTileCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const state = useEditorStore.getState()
    const tileX = Math.floor((x / state.zoom + state.cameraX) / TILE_SIZE)
    const tileY = Math.floor((y / state.zoom + state.cameraY) / TILE_SIZE)
    return { x: tileX, y: tileY }
  }, [])

  const getActiveLayer = useCallback(() => {
    const map = useEditorStore.getState().currentMap
    const layerId = useEditorStore.getState().selectedLayerId
    if (!map) return null
    if (layerId) {
      const layer = map.layers.find((l) => l.id === layerId)
      if (layer) return layer
    }
    return map.layers.find((l) => l.type === 'terrain') || null
  }, [])

  function paintTile(coords: { x: number; y: number }) {
    const state = useEditorStore.getState()
    const map = state.currentMap
    if (!map) return
    const layer = getActiveLayer()
    if (!layer || layer.locked) return

    const idx = coords.y * map.width + coords.x
    if (idx < 0 || idx >= layer.data.length) return

    const paintValue = layer.type === 'collision' ? 1 : state.selectedTileId
    if (layer.data[idx] === paintValue) return

    updateMapData((m) => ({
      ...m,
      layers: m.layers.map((l) => {
        if (l.id !== layer.id) return l
        const data = [...l.data]
        data[idx] = paintValue
        return { ...l, data }
      }),
    }))
  }

  function eraseTile(coords: { x: number; y: number }) {
    const map = useEditorStore.getState().currentMap
    if (!map) return
    const layer = getActiveLayer()
    if (!layer || layer.locked) return

    const idx = coords.y * map.width + coords.x
    if (idx < 0 || idx >= layer.data.length) return

    updateMapData((m) => ({
      ...m,
      layers: m.layers.map((l) => {
        if (l.id !== layer.id) return l
        const data = [...l.data]
        data[idx] = 0
        return { ...l, data }
      }),
    }))
  }

  function floodFill(startX: number, startY: number) {
    const state = useEditorStore.getState()
    const map = state.currentMap
    if (!map) return
    const layer = getActiveLayer()
    if (!layer || layer.locked) return

    const idx = startY * map.width + startX
    if (idx < 0 || idx >= layer.data.length) return

    const targetId = layer.data[idx]
    const fillId = layer.type === 'collision' ? 1 : state.selectedTileId
    if (targetId === fillId) return

    const data = [...layer.data]
    const queue: [number, number][] = [[startX, startY]]
    const visited = new Set<number>()

    while (queue.length > 0) {
      const [cx, cy] = queue.shift()!
      const ci = cy * map.width + cx
      if (visited.has(ci)) continue
      if (cx < 0 || cx >= map.width || cy < 0 || cy >= map.height) continue
      if (data[ci] !== targetId) continue

      visited.add(ci)
      data[ci] = fillId

      queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1])
    }

    updateMapData((m) => ({
      ...m,
      layers: m.layers.map((l) => {
        if (l.id !== layer.id) return l
        return { ...l, data }
      }),
    }))
  }

  function placeEvent(coords: { x: number; y: number }) {
    const state = useEditorStore.getState()
    const eventType = state.placingEventType || 'trigger'
    const newEvent: EventObject = {
      id: crypto.randomUUID(),
      type: eventType,
      x: coords.x,
      y: coords.y,
      properties: {},
    }
    updateMapData((m) => ({
      ...m,
      events: [...m.events, newEvent],
    }))
    setSelectedEventId(newEvent.id)
  }

  function selectEventAtTile(coords: { x: number; y: number }) {
    const map = useEditorStore.getState().currentMap
    if (!map) return
    const found = map.events.find((e) => e.x === coords.x && e.y === coords.y)
    setSelectedEventId(found?.id ?? null)
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (e.button === 1 || e.button === 2) {
      isPanning.current = true
      lastPanPos.current = { x: e.clientX, y: e.clientY }
      return
    }

    const coords = getTileCoords(e)
    if (!coords) return

    const state = useEditorStore.getState()
    const map = state.currentMap
    if (!map || coords.x < 0 || coords.x >= map.width || coords.y < 0 || coords.y >= map.height) return

    isDrawing.current = true
    pushUndo()

    if (state.tool === 'brush') paintTile(coords)
    else if (state.tool === 'eraser') eraseTile(coords)
    else if (state.tool === 'fill') floodFill(coords.x, coords.y)
    else if (state.tool === 'event') placeEvent(coords)
    else if (state.tool === 'select') selectEventAtTile(coords)
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isPanning.current) {
      const state = useEditorStore.getState()
      const dx = e.clientX - lastPanPos.current.x
      const dy = e.clientY - lastPanPos.current.y
      setCamera(state.cameraX - dx / state.zoom, state.cameraY - dy / state.zoom)
      lastPanPos.current = { x: e.clientX, y: e.clientY }
      return
    }

    const coords = getTileCoords(e)
    hoveredTile.current = coords

    if (!isDrawing.current || !coords) return
    const state = useEditorStore.getState()
    if (state.tool === 'brush') paintTile(coords)
    else if (state.tool === 'eraser') eraseTile(coords)
  }

  function handleMouseUp() {
    isDrawing.current = false
    isPanning.current = false
  }

  function handleMouseLeave() {
    hoveredTile.current = null
    isDrawing.current = false
    isPanning.current = false
  }

  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault()
    const state = useEditorStore.getState()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    const newZoom = Math.max(0.25, Math.min(4, state.zoom + delta))

    const canvas = canvasRef.current
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const worldX = mouseX / state.zoom + state.cameraX
      const worldY = mouseY / state.zoom + state.cameraY
      setCamera(worldX - mouseX / newZoom, worldY - mouseY / newZoom)
    }
    setZoom(newZoom)
  }

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden bg-[#0d0d1a]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      {showCrt && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'repeating-linear-gradient(0deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 1px, transparent 1px, transparent 3px)',
          }}
        />
      )}
    </div>
  )
}
