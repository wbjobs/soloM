export const TILE_SIZE = 32

export const COLOR_PALETTE: string[] = [
  '#2d1b00',
  '#5c3a1e',
  '#8b6914',
  '#c4a44a',
  '#3e5c1e',
  '#5a8c28',
  '#8fbc3a',
  '#b4d668',
  '#1a3a5c',
  '#2e6b8a',
  '#4a9ebe',
  '#7ec8e3',
  '#4a4a4a',
  '#808080',
  '#b0b0b0',
  '#e0e0e0',
]

export function getTileColor(tileId: number): string {
  if (tileId <= 0) return 'transparent'
  return COLOR_PALETTE[(tileId - 1) % COLOR_PALETTE.length]
}

export function getCollisionColor(): string {
  return 'rgba(255, 0, 0, 0.35)'
}

export function getEventColor(type: string): string {
  switch (type) {
    case 'teleport':
      return '#4a9ebe'
    case 'npc':
      return '#c4a44a'
    case 'chest':
      return '#8fbc3a'
    case 'trigger':
      return '#e05050'
    case 'dialog':
      return '#a855f7'
    case 'custom':
      return '#f97316'
    default:
      return '#808080'
  }
}

export function generateDefaultTileset(): ImageData {
  const canvas = new OffscreenCanvas(TILE_SIZE * 16, TILE_SIZE)
  const ctx = canvas.getContext('2d')!
  for (let i = 0; i < 16; i++) {
    const x = i * TILE_SIZE
    ctx.fillStyle = COLOR_PALETTE[i]
    ctx.fillRect(x, 0, TILE_SIZE, TILE_SIZE)
    const shade = i % 2 === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
    ctx.fillStyle = shade
    for (let py = 0; py < TILE_SIZE; py += 4) {
      for (let px = 0; px < TILE_SIZE; px += 4) {
        if ((px + py) % 8 === 0) {
          ctx.fillRect(x + px, py, 2, 2)
        }
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.fillRect(x, TILE_SIZE - 2, TILE_SIZE, 2)
    ctx.fillRect(x + TILE_SIZE - 2, 0, 2, TILE_SIZE)
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}
