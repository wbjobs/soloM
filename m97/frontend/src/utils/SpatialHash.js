export default class SpatialHash {
  constructor() {
    this.map = new Map()
  }

  static key(x, y, z) {
    return `${x},${y},${z}`
  }

  set(x, y, z, value) {
    this.map.set(SpatialHash.key(x, y, z), value)
  }

  get(x, y, z) {
    return this.map.get(SpatialHash.key(x, y, z))
  }

  has(x, y, z) {
    return this.map.has(SpatialHash.key(x, y, z))
  }

  delete(x, y, z) {
    this.map.delete(SpatialHash.key(x, y, z))
  }

  loadBlocks(blocks, removedBlocks) {
    this.map.clear()
    for (const block of blocks) {
      if (removedBlocks && removedBlocks.has(SpatialHash.key(block.x, block.y, block.z))) continue
      this.set(block.x, block.y, block.z, block.blockId)
    }
  }

  isSolid(x, y, z) {
    return this.map.has(SpatialHash.key(Math.floor(x), Math.floor(y), Math.floor(z)))
  }

  collideAABB(minX, minY, minZ, maxX, maxY, maxZ) {
    const x0 = Math.floor(minX)
    const y0 = Math.floor(minY)
    const z0 = Math.floor(minZ)
    const x1 = Math.floor(maxX)
    const y1 = Math.floor(maxY)
    const z1 = Math.floor(maxZ)

    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          if (this.map.has(SpatialHash.key(x, y, z))) {
            return true
          }
        }
      }
    }
    return false
  }

  resolveCollision(pos, halfWidth, height) {
    const hw = halfWidth
    const feetY = pos.y - height
    const headY = pos.y

    const minX = pos.x - hw
    const maxX = pos.x + hw
    const minZ = pos.z - hw
    const maxZ = pos.z + hw

    const x0 = Math.floor(minX)
    const x1 = Math.floor(maxX)
    const z0 = Math.floor(minZ)
    const z1 = Math.floor(maxZ)
    const y0 = Math.floor(feetY)
    const y1 = Math.floor(headY)

    for (let bx = x0; bx <= x1; bx++) {
      for (let by = y0; by <= y1; by++) {
        for (let bz = z0; bz <= z1; bz++) {
          if (!this.map.has(SpatialHash.key(bx, by, bz))) continue

          const blockMinX = bx
          const blockMaxX = bx + 1
          const blockMinY = by
          const blockMaxY = by + 1
          const blockMinZ = bz
          const blockMaxZ = bz + 1

          const overlapX = Math.min(maxX - blockMinX, blockMaxX - minX)
          const overlapY = Math.min(headY - blockMinY, blockMaxY - feetY)
          const overlapZ = Math.min(maxZ - blockMinZ, blockMaxZ - minZ)

          if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) continue

          if (overlapX < overlapY && overlapX < overlapZ) {
            if (pos.x < bx + 0.5) {
              pos.x = blockMinX - hw - 0.001
            } else {
              pos.x = blockMaxX + hw + 0.001
            }
          } else if (overlapY < overlapX && overlapY < overlapZ) {
            if (pos.y - height / 2 < by + 0.5) {
              pos.y = blockMinY + 0.001
            } else {
              pos.y = blockMaxY + height + 0.001
            }
          } else {
            if (pos.z < bz + 0.5) {
              pos.z = blockMinZ - hw - 0.001
            } else {
              pos.z = blockMaxZ + hw + 0.001
            }
          }

          return true
        }
      }
    }
    return false
  }
}
