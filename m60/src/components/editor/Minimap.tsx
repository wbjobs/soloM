import { useRef, useEffect } from 'react'
import { useEditorStore } from '@/stores/editorStore'
import { TILE_SIZE, getTileColor, getEventColor } from '@/utils/tileset'

const MAX_SIZE = 150

export default function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const currentMap = useEditorStore((s) => s.currentMap)
  const zoom = useEditorStore((s) => s.zoom)
  const cameraX = useEditorStore((s) => s.cameraX)
  const cameraY = useEditorStore((s) => s.cameraY)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !currentMap) return

    const mapPixelW = currentMap.width * TILE_SIZE
    const mapPixelH = currentMap.height * TILE_SIZE
    const scale = Math.min(MAX_SIZE / mapPixelW, MAX_SIZE / mapPixelH, 1)
    const w = Math.floor(mapPixelW * scale)
    const h = Math.floor(mapPixelH * scale)

    canvas.width = w
    canvas.height = h

    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#0d0d1a'
    ctx.fillRect(0, 0, w, h)

    const tileW = (TILE_SIZE * scale)
    const tileH = (TILE_SIZE * scale)

    for (const layer of currentMap.layers) {
      if (!layer.visible || layer.type !== 'terrain') continue
      for (let row = 0; row < currentMap.height; row++) {
        for (let col = 0; col < currentMap.width; col++) {
          const idx = row * currentMap.width + col
          const tileId = layer.data[idx]
          if (tileId > 0) {
            ctx.fillStyle = getTileColor(tileId)
            ctx.fillRect(col * tileW, row * tileH, tileW, tileH)
          }
        }
      }
    }

    for (const event of currentMap.events) {
      ctx.fillStyle = getEventColor(event.type)
      const ex = event.x * tileW + tileW / 2
      const ey = event.y * tileH + tileH / 2
      const s = Math.max(tileW, tileH) * 0.4
      ctx.beginPath()
      ctx.moveTo(ex, ey - s)
      ctx.lineTo(ex + s, ey)
      ctx.lineTo(ex, ey + s)
      ctx.lineTo(ex - s, ey)
      ctx.closePath()
      ctx.fill()
    }

    const container = canvas.parentElement
    if (container) {
      const cw = container.clientWidth
      const ch = container.clientHeight
      const vpX = (cameraX * scale)
      const vpY = (cameraY * scale)
      const vpW = (cw / zoom) * scale
      const vpH = (ch / zoom) * scale
      ctx.strokeStyle = 'red'
      ctx.lineWidth = 2
      ctx.strokeRect(vpX, vpY, vpW, vpH)
    }
  }, [currentMap, zoom, cameraX, cameraY])

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas || !currentMap) return

    const mapPixelW = currentMap.width * TILE_SIZE
    const mapPixelH = currentMap.height * TILE_SIZE
    const scale = Math.min(MAX_SIZE / mapPixelW, MAX_SIZE / mapPixelH, 1)

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const worldX = x / scale
    const worldY = y / scale

    const container = canvas.parentElement
    if (container) {
      const cw = container.clientWidth
      const ch = container.clientHeight
      const state = useEditorStore.getState()
      const newCamX = worldX - cw / state.zoom / 2
      const newCamY = worldY - ch / state.zoom / 2
      useEditorStore.getState().setCamera(newCamX, newCamY)
    }
  }

  if (!currentMap) return null

  return (
    <div className="absolute bottom-2 right-2 border border-[#333] bg-[#0d0d1a] rounded overflow-hidden shadow-lg">
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="cursor-pointer"
      />
    </div>
  )
}
