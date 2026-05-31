import type { TileMap } from '../../shared/types'
import { TILE_SIZE } from '../utils/tileset'

const EPSILON = 0.0001

export function getCollisionTileAt(map: TileMap, tileX: number, tileY: number, collisionLayerData?: number[]): boolean {
  if (tileX < 0 || tileX >= map.width || tileY < 0 || tileY >= map.height) return true
  const data = collisionLayerData ?? map.layers.find((l) => l.type === 'collision')?.data
  if (!data) return false
  return data[tileY * map.width + tileX] === 1
}

export function checkCollision(
  map: TileMap,
  x: number,
  y: number,
  width: number,
  height: number,
  collisionLayerData?: number[],
): boolean {
  const left = Math.floor((x + EPSILON) / TILE_SIZE)
  const right = Math.floor((x + width - 1 - EPSILON) / TILE_SIZE)
  const top = Math.floor((y + EPSILON) / TILE_SIZE)
  const bottom = Math.floor((y + height - 1 - EPSILON) / TILE_SIZE)

  const data = collisionLayerData ?? map.layers.find((l) => l.type === 'collision')?.data
  if (!data) return false

  const mapWidth = map.width
  for (let ty = top; ty <= bottom; ty++) {
    const rowBase = ty * mapWidth
    for (let tx = left; tx <= right; tx++) {
      if (data[rowBase + tx] === 1) return true
    }
  }
  return false
}

export function getCollisionLayerData(map: TileMap): number[] | undefined {
  return map.layers.find((l) => l.type === 'collision')?.data
}

export function resolveCollision(
  map: TileMap,
  x: number,
  y: number,
  width: number,
  height: number,
  velocityX: number,
  velocityY: number,
  collisionLayerData?: number[],
): { x: number; y: number; collidedX: boolean; collidedY: boolean } {
  const data = collisionLayerData ?? getCollisionLayerData(map)
  const result = { x, y, collidedX: false, collidedY: false }

  const newX = x + velocityX
  if (checkCollision(map, newX, y, width, height, data)) {
    result.collidedX = true
    if (velocityX > 0) {
      const tileRight = Math.floor((x + width - 1 - EPSILON) / TILE_SIZE) + 1
      result.x = tileRight * TILE_SIZE - width
    } else if (velocityX < 0) {
      const tileLeft = Math.floor((x + EPSILON) / TILE_SIZE)
      result.x = tileLeft * TILE_SIZE
    }
  } else {
    result.x = newX
  }

  const newY = y + velocityY
  if (checkCollision(map, result.x, newY, width, height, data)) {
    result.collidedY = true
    if (velocityY > 0) {
      const tileBottom = Math.floor((y + height - 1 - EPSILON) / TILE_SIZE) + 1
      result.y = tileBottom * TILE_SIZE - height
    } else if (velocityY < 0) {
      const tileTop = Math.floor((y + EPSILON) / TILE_SIZE)
      result.y = tileTop * TILE_SIZE
    }
  } else {
    result.y = newY
  }

  return result
}

export function pushOutOfWalls(
  map: TileMap,
  x: number,
  y: number,
  width: number,
  height: number,
  collisionLayerData?: number[],
): { x: number; y: number } {
  const data = collisionLayerData ?? getCollisionLayerData(map)
  if (!data) return { x, y }

  let resultX = x
  let resultY = y
  let maxIter = 8

  while (maxIter-- > 0 && checkCollision(map, resultX, resultY, width, height, data)) {
    const left = Math.floor((resultX + EPSILON) / TILE_SIZE)
    const right = Math.floor((resultX + width - 1 - EPSILON) / TILE_SIZE)
    const top = Math.floor((resultY + EPSILON) / TILE_SIZE)
    const bottom = Math.floor((resultY + height - 1 - EPSILON) / TILE_SIZE)

    const mapWidth = map.width
    let pushX = 0
    let pushY = 0

    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) {
        if (data[ty * mapWidth + tx] === 1) {
          const tileLeft = tx * TILE_SIZE
          const tileRight = (tx + 1) * TILE_SIZE
          const tileTop = ty * TILE_SIZE
          const tileBottom = (ty + 1) * TILE_SIZE

          const overlapLeft = resultX + width - tileLeft
          const overlapRight = tileRight - resultX
          const overlapTop = resultY + height - tileTop
          const overlapBottom = tileBottom - resultY

          const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom)

          if (minOverlap === overlapLeft) pushX = Math.min(pushX, -overlapLeft)
          else if (minOverlap === overlapRight) pushX = Math.max(pushX, overlapRight)
          else if (minOverlap === overlapTop) pushY = Math.min(pushY, -overlapTop)
          else if (minOverlap === overlapBottom) pushY = Math.max(pushY, overlapBottom)
        }
      }
    }

    if (Math.abs(pushX) < Math.abs(pushY)) {
      resultX += pushX
    } else if (Math.abs(pushY) < Math.abs(pushX)) {
      resultY += pushY
    } else {
      resultX += pushX
      resultY += pushY
    }

    if (pushX === 0 && pushY === 0) break
  }

  return { x: resultX, y: resultY }
}
