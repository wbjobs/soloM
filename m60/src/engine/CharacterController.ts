import type { TileMap } from '../../shared/types'
import { resolveCollision, pushOutOfWalls, getCollisionLayerData } from './CollisionSystem'
import { TILE_SIZE } from '../utils/tileset'

export type Direction = 'up' | 'down' | 'left' | 'right'

export interface InputState {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
}

export interface CharacterRect {
  x: number
  y: number
  width: number
  height: number
}

const DEFAULT_SPEED = 120
const DEFAULT_SIZE = 24

export class CharacterController {
  x: number
  y: number
  width: number
  height: number
  speed: number
  direction: Direction
  velocityX: number
  velocityY: number

  constructor(x = 0, y = 0) {
    this.x = x
    this.y = y
    this.width = DEFAULT_SIZE
    this.height = DEFAULT_SIZE
    this.speed = DEFAULT_SPEED
    this.direction = 'down'
    this.velocityX = 0
    this.velocityY = 0
  }

  update(deltaTime: number, input: InputState, map: TileMap): void {
    let dx = 0
    let dy = 0

    if (input.up) dy -= 1
    if (input.down) dy += 1
    if (input.left) dx -= 1
    if (input.right) dx += 1

    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy)
      dx /= len
      dy /= len
    }

    this.velocityX = dx * this.speed
    this.velocityY = dy * this.speed

    if (dy < 0) this.direction = 'up'
    else if (dy > 0) this.direction = 'down'
    if (dx < 0) this.direction = 'left'
    else if (dx > 0) this.direction = 'right'

    const offsetX = (TILE_SIZE - this.width) / 2
    const offsetY = (TILE_SIZE - this.height) / 2
    const charX = this.x + offsetX
    const charY = this.y + offsetY

    const collisionData = getCollisionLayerData(map)

    const resolved = resolveCollision(
      map,
      charX,
      charY,
      this.width,
      this.height,
      this.velocityX * deltaTime,
      this.velocityY * deltaTime,
      collisionData,
    )

    const pushed = pushOutOfWalls(map, resolved.x, resolved.y, this.width, this.height, collisionData)

    this.x = pushed.x - offsetX
    this.y = pushed.y - offsetY
  }

  getCharacterRect(): CharacterRect {
    const offsetX = (TILE_SIZE - this.width) / 2
    const offsetY = (TILE_SIZE - this.height) / 2
    return {
      x: this.x + offsetX,
      y: this.y + offsetY,
      width: this.width,
      height: this.height,
    }
  }
}
