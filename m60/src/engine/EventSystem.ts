import type { TileMap, EventObject } from '../../shared/types'
import { TILE_SIZE } from '../utils/tileset'

const RADIUS = TILE_SIZE

export function getEventsNear(
  map: TileMap,
  tileX: number,
  tileY: number,
  range: number = 2,
): EventObject[] {
  const result: EventObject[] = []
  const minX = tileX - range
  const maxX = tileX + range
  const minY = tileY - range
  const maxY = tileY + range

  for (const event of map.events) {
    if (event.x >= minX && event.x <= maxX && event.y >= minY && event.y <= maxY) {
      result.push(event)
    }
  }
  return result
}

export function checkEvents(
  map: TileMap,
  characterX: number,
  characterY: number,
  characterWidth: number,
  characterHeight: number,
): EventObject[] {
  const charCenterX = characterX + characterWidth / 2
  const charCenterY = characterY + characterHeight / 2
  const charTileX = Math.floor(charCenterX / TILE_SIZE)
  const charTileY = Math.floor(charCenterY / TILE_SIZE)

  const nearEvents = getEventsNear(map, charTileX, charTileY, 1)
  const result: EventObject[] = []

  for (const event of nearEvents) {
    const eventCenterX = event.x * TILE_SIZE + TILE_SIZE / 2
    const eventCenterY = event.y * TILE_SIZE + TILE_SIZE / 2
    const dx = charCenterX - eventCenterX
    const dy = charCenterY - eventCenterY
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < RADIUS) {
      const eventTileX1 = event.x * TILE_SIZE
      const eventTileX2 = (event.x + 1) * TILE_SIZE
      const eventTileY1 = event.y * TILE_SIZE
      const eventTileY2 = (event.y + 1) * TILE_SIZE

      const overlapsX = characterX + characterWidth > eventTileX1 && characterX < eventTileX2
      const overlapsY = characterY + characterHeight > eventTileY1 && characterY < eventTileY2

      if (overlapsX && overlapsY) {
        result.push(event)
      }
    }
  }
  return result
}

export function handleEvent(event: EventObject): string {
  switch (event.type) {
    case 'teleport':
      return `传送至 (${event.properties.targetX ?? '?'}, ${event.properties.targetY ?? '?'})`
    case 'npc':
      return event.properties.dialog ?? 'NPC: ...'
    case 'chest':
      return `获得: ${event.properties.item ?? '未知物品'}`
    case 'trigger':
      return `触发: ${event.properties.name ?? '事件'}`
    default:
      return '未知事件'
  }
}
