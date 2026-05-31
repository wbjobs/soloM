import type { TileMap } from '../../shared/types'
import { TILE_SIZE, getTileColor, getCollisionColor, getEventColor } from '../utils/tileset'

interface RenderOptions {
  zoom: number
  cameraX: number
  cameraY: number
  showGrid: boolean
  selectedLayerId: string | null
  selectedEventId: string | null
  hoveredTile?: { x: number; y: number } | null
}

export class Renderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
  }

  renderMap(map: TileMap, options: RenderOptions): void {
    const { zoom, cameraX, cameraY, showGrid, selectedLayerId, selectedEventId, hoveredTile } = options
    const ctx = this.ctx
    const { width: cw, height: ch } = this.canvas

    ctx.clearRect(0, 0, cw, ch)
    ctx.save()
    ctx.scale(zoom, zoom)
    ctx.translate(-cameraX, -cameraY)

    const startCol = Math.max(0, Math.floor(cameraX / TILE_SIZE))
    const startRow = Math.max(0, Math.floor(cameraY / TILE_SIZE))
    const endCol = Math.min(map.width, Math.ceil((cameraX + cw / zoom) / TILE_SIZE))
    const endRow = Math.min(map.height, Math.ceil((cameraY + ch / zoom) / TILE_SIZE))

    const sortedLayers = [...map.layers].sort((a, b) => a.order - b.order)

    for (const layer of sortedLayers) {
      if (!layer.visible) continue
      if (selectedLayerId && layer.id !== selectedLayerId && layer.type !== 'collision') continue

      if (layer.type === 'terrain') {
        this.renderTerrainLayer(ctx, map, layer.data, startCol, startRow, endCol, endRow)
      } else if (layer.type === 'collision') {
        this.renderCollisionLayer(ctx, map, layer.data, startCol, startRow, endCol, endRow)
      }
    }

    this.renderEvents(ctx, map, selectedEventId)

    if (showGrid) {
      this.renderGrid(ctx, map, startCol, startRow, endCol, endRow)
    }

    if (hoveredTile) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 2 / zoom
      ctx.strokeRect(hoveredTile.x * TILE_SIZE, hoveredTile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
    }

    ctx.restore()
  }

  private renderTerrainLayer(
    ctx: CanvasRenderingContext2D,
    map: TileMap,
    data: number[],
    startCol: number,
    startRow: number,
    endCol: number,
    endRow: number,
  ): void {
    for (let row = startRow; row < endRow; row++) {
      for (let col = startCol; col < endCol; col++) {
        const idx = row * map.width + col
        const tileId = data[idx]
        if (tileId > 0) {
          ctx.fillStyle = getTileColor(tileId)
          ctx.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE)
        }
      }
    }
  }

  private renderCollisionLayer(
    ctx: CanvasRenderingContext2D,
    map: TileMap,
    data: number[],
    startCol: number,
    startRow: number,
    endCol: number,
    endRow: number,
  ): void {
    ctx.fillStyle = getCollisionColor()
    for (let row = startRow; row < endRow; row++) {
      for (let col = startCol; col < endCol; col++) {
        const idx = row * map.width + col
        if (data[idx] === 1) {
          ctx.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE)
          ctx.strokeStyle = 'rgba(255,0,0,0.5)'
          ctx.lineWidth = 1
          ctx.strokeRect(col * TILE_SIZE + 1, row * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2)
        }
      }
    }
  }

  private renderEvents(
    ctx: CanvasRenderingContext2D,
    map: TileMap,
    selectedEventId: string | null,
  ): void {
    for (const event of map.events) {
      const cx = event.x * TILE_SIZE + TILE_SIZE / 2
      const cy = event.y * TILE_SIZE + TILE_SIZE / 2
      const size = TILE_SIZE * 0.4
      ctx.fillStyle = getEventColor(event.type)
      ctx.beginPath()
      ctx.moveTo(cx, cy - size)
      ctx.lineTo(cx + size, cy)
      ctx.lineTo(cx, cy + size)
      ctx.lineTo(cx - size, cy)
      ctx.closePath()
      ctx.fill()

      if (event.id === selectedEventId) {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }
  }

  private renderGrid(
    ctx: CanvasRenderingContext2D,
    map: TileMap,
    startCol: number,
    startRow: number,
    endCol: number,
    endRow: number,
  ): void {
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 0.5
    for (let col = startCol; col <= endCol; col++) {
      ctx.beginPath()
      ctx.moveTo(col * TILE_SIZE, startRow * TILE_SIZE)
      ctx.lineTo(col * TILE_SIZE, endRow * TILE_SIZE)
      ctx.stroke()
    }
    for (let row = startRow; row <= endRow; row++) {
      ctx.beginPath()
      ctx.moveTo(startCol * TILE_SIZE, row * TILE_SIZE)
      ctx.lineTo(endCol * TILE_SIZE, row * TILE_SIZE)
      ctx.stroke()
    }
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  resize(width: number, height: number): void {
    this.canvas.width = width
    this.canvas.height = height
  }
}
