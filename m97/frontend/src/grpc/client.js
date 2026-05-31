const GRPC_SERVER = 'http://localhost:8080'

function encodeVarint(value) {
  const bytes = []
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80)
    value >>>= 7
  }
  bytes.push(value & 0x7f)
  return new Uint8Array(bytes)
}

function decodeVarint(reader, offset) {
  let result = 0
  let shift = 0
  let byte
  do {
    byte = reader[offset]
    result |= (byte & 0x7f) << shift
    shift += 7
    offset++
  } while (byte & 0x80)
  return { value: result >>> 0, nextOffset: offset }
}

function encodeField(tag, data) {
  const parts = [encodeVarint(tag)]
  if (data instanceof Uint8Array) {
    parts.push(encodeVarint(data.length))
    parts.push(data)
  } else {
    parts.push(data)
  }
  let totalLen = 0
  for (const p of parts) totalLen += p.length
  const result = new Uint8Array(totalLen)
  let offset = 0
  for (const p of parts) {
    result.set(p, offset)
    offset += p.length
  }
  return result
}

function encodeInt32(tag, value) {
  const buf = new Uint8Array(4)
  new DataView(buf.buffer).setInt32(0, value, true)
  return encodeField(tag, buf)
}

function encodeChunkRequest(chunkX, chunkZ, worldPath) {
  const parts = []
  parts.push(encodeInt32(1 << 3 | 0, chunkX))
  parts.push(encodeInt32(2 << 3 | 0, chunkZ))
  if (worldPath) {
    const pathBytes = new TextEncoder().encode(worldPath)
    parts.push(encodeField(3 << 3 | 2, pathBytes))
  }
  let totalLen = 0
  for (const p of parts) totalLen += p.length
  const body = new Uint8Array(totalLen)
  let offset = 0
  for (const p of parts) {
    body.set(p, offset)
    offset += p.length
  }
  return body
}

function encodeRegionRequest(regionX, regionZ, worldPath) {
  const parts = []
  parts.push(encodeInt32(1 << 3 | 0, regionX))
  parts.push(encodeInt32(2 << 3 | 0, regionZ))
  if (worldPath) {
    const pathBytes = new TextEncoder().encode(worldPath)
    parts.push(encodeField(3 << 3 | 2, pathBytes))
  }
  let totalLen = 0
  for (const p of parts) totalLen += p.length
  const body = new Uint8Array(totalLen)
  let offset = 0
  for (const p of parts) {
    body.set(p, offset)
    offset += p.length
  }
  return body
}

function decodeBlocks(data) {
  const blocks = []
  let offset = 0
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

  let x = 0, y = 0, z = 0, blockId = 0
  let currentField = 0

  while (offset < data.length) {
    const { value: tag, nextOffset } = decodeVarint(data, offset)
    offset = nextOffset
    const fieldNumber = tag >> 3
    const wireType = tag & 0x07

    if (wireType === 0) {
      const { value, nextOffset: no } = decodeVarint(data, offset)
      offset = no
      if (fieldNumber === 1) x = value | 0
      else if (fieldNumber === 2) y = value | 0
      else if (fieldNumber === 3) z = value | 0
      else if (fieldNumber === 4) blockId = value | 0
    } else if (wireType === 2) {
      const { value: len, nextOffset: no } = decodeVarint(data, offset)
      offset = no
      offset += len
    } else if (wireType === 5) {
      offset += 4
    } else if (wireType === 1) {
      offset += 8
    } else {
      break
    }
  }

  return blocks
}

function decodeChunkData(data) {
  const blocks = []
  let offset = 0
  let chunkX = 0, chunkZ = 0, loaded = false
  let currentBlock = null

  while (offset < data.length) {
    const { value: tag, nextOffset } = decodeVarint(data, offset)
    offset = nextOffset
    const fieldNumber = tag >> 3
    const wireType = tag & 0x07

    if (wireType === 0) {
      const { value, nextOffset: no } = decodeVarint(data, offset)
      offset = no

      if (fieldNumber === 1) {
        if (currentBlock) blocks.push(currentBlock)
        currentBlock = null
        chunkX = (value | 0)
      } else if (fieldNumber === 2) {
        chunkZ = (value | 0)
      } else if (fieldNumber === 4) {
        loaded = (value !== 0)
      }
    } else if (wireType === 2) {
      const { value: len, nextOffset: no } = decodeVarint(data, offset)
      offset = no
      const subData = data.slice(offset, offset + len)
      offset += len

      if (fieldNumber === 3) {
        const block = decodeBlock(subData)
        if (block) blocks.push(block)
      }
    } else if (wireType === 5) {
      offset += 4
    } else if (wireType === 1) {
      offset += 8
    } else {
      break
    }
  }

  return { chunkX, chunkZ, blocks, loaded }
}

function decodeBlock(data) {
  let x = 0, y = 0, z = 0, blockId = 0
  let offset = 0

  while (offset < data.length) {
    const { value: tag, nextOffset } = decodeVarint(data, offset)
    offset = nextOffset
    const fieldNumber = tag >> 3
    const wireType = tag & 0x07

    if (wireType === 0) {
      let result
      const { value, nextOffset: no } = decodeVarint(data, offset)
      offset = no

      if (fieldNumber === 1) x = value > 0x7fffffff ? value - 0x100000000 : value
      else if (fieldNumber === 2) y = value > 0x7fffffff ? value - 0x100000000 : value
      else if (fieldNumber === 3) z = value > 0x7fffffff ? value - 0x100000000 : value
      else if (fieldNumber === 4) blockId = value > 0x7fffffff ? value - 0x100000000 : value
    } else if (wireType === 5) {
      offset += 4
    } else if (wireType === 1) {
      offset += 8
    } else if (wireType === 2) {
      const { value: len, nextOffset: no } = decodeVarint(data, offset)
      offset = no
      offset += len
    } else {
      break
    }
  }

  return { x, y, z, blockId }
}

function decodeRegionData(data) {
  const chunks = []
  let regionX = 0, regionZ = 0
  let offset = 0

  while (offset < data.length) {
    const { value: tag, nextOffset } = decodeVarint(data, offset)
    offset = nextOffset
    const fieldNumber = tag >> 3
    const wireType = tag & 0x07

    if (wireType === 0) {
      const { value, nextOffset: no } = decodeVarint(data, offset)
      offset = no
      if (fieldNumber === 1) regionX = value > 0x7fffffff ? value - 0x100000000 : value
      else if (fieldNumber === 2) regionZ = value > 0x7fffffff ? value - 0x100000000 : value
    } else if (wireType === 2) {
      const { value: len, nextOffset: no } = decodeVarint(data, offset)
      offset = no
      const subData = data.slice(offset, offset + len)
      offset += len

      if (fieldNumber === 3) {
        const chunk = decodeChunkData(subData)
        chunks.push(chunk)
      }
    } else if (wireType === 5) {
      offset += 4
    } else if (wireType === 1) {
      offset += 8
    } else {
      break
    }
  }

  return { regionX, regionZ, chunks }
}

export async function fetchRegion(regionX, regionZ, worldPath = '') {
  const body = encodeRegionRequest(regionX, regionZ, worldPath)
  const grpcBody = new Uint8Array(5 + body.length)
  grpcBody[0] = 0
  new DataView(grpcBody.buffer).setUint32(1, body.length, false)
  grpcBody.set(body, 5)

  try {
    const response = await fetch(`${GRPC_SERVER}/voxel.VoxelService/GetRegion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/grpc',
        'Accept': 'application/grpc',
        'x-grpc-web': '1',
        'grpc-encoding': 'identity',
      },
      body: grpcBody,
    })

    if (!response.ok) {
      throw new Error(`gRPC request failed: ${response.status}`)
    }

    const buffer = await response.arrayBuffer()
    const fullData = new Uint8Array(buffer)

    if (fullData.length < 5) {
      return { regionX, regionZ, chunks: [] }
    }

    const payloadLen = new DataView(fullData.buffer).getUint32(1, false)
    const payload = fullData.slice(5, 5 + payloadLen)

    return decodeRegionData(payload)
  } catch (err) {
    console.error('Failed to fetch region:', err)
    return { regionX, regionZ, chunks: [] }
  }
}

export async function fetchDemoRegion() {
  return generateDemoTerrain()
}

export async function fetchChunk(chunkX, chunkZ, worldPath = '') {
  const body = encodeChunkRequest(chunkX, chunkZ, worldPath)
  const grpcBody = new Uint8Array(5 + body.length)
  grpcBody[0] = 0
  new DataView(grpcBody.buffer).setUint32(1, body.length, false)
  grpcBody.set(body, 5)

  try {
    const response = await fetch(`${GRPC_SERVER}/voxel.VoxelService/GetChunk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/grpc',
        'Accept': 'application/grpc',
        'x-grpc-web': '1',
        'grpc-encoding': 'identity',
      },
      body: grpcBody,
    })

    if (!response.ok) {
      throw new Error(`gRPC request failed: ${response.status}`)
    }

    const buffer = await response.arrayBuffer()
    const fullData = new Uint8Array(buffer)

    if (fullData.length < 5) {
      return { chunkX, chunkZ, blocks: [], loaded: false }
    }

    const payloadLen = new DataView(fullData.buffer).getUint32(1, false)
    const payload = fullData.slice(5, 5 + payloadLen)

    return decodeChunkData(payload)
  } catch (err) {
    console.error('Failed to fetch chunk:', err)
    return { chunkX, chunkZ, blocks: [], loaded: false }
  }
}

export function fetchDemoChunk(cx, cz) {
  const blocks = []
  const chunkSize = 16
  const worldOffsetX = cx * chunkSize
  const worldOffsetZ = cz * chunkSize

  for (let x = 0; x < chunkSize; x++) {
    for (let z = 0; z < chunkSize; z++) {
      const worldX = worldOffsetX + x
      const worldZ = worldOffsetZ + z
      const height = getTerrainHeight(worldX, worldZ)

      for (let y = 0; y <= height; y++) {
        let blockId
        if (y === 0) {
          blockId = 7
        } else if (y < height - 3) {
          blockId = 1
        } else if (y < height) {
          blockId = 3
        } else {
          blockId = height < 5 ? 12 : 2
        }
        blocks.push({ x: worldX, y, z: worldZ, blockId })
      }

      if (height > 6 && worldX % 7 === 3 && worldZ % 7 === 3 && height < 18) {
        for (let ty = height + 1; ty < height + 5; ty++) {
          blocks.push({ x: worldX, y: ty, z: worldZ, blockId: 17 })
        }
        for (let dx = -2; dx <= 2; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
            for (let dy = 0; dy <= 2; dy++) {
              const lx = worldX + dx
              const lz = worldZ + dz
              const ly = height + 4 + dy
              const dist = Math.abs(dx) + Math.abs(dz) + dy
              if (dist <= 3 && lx >= 0 && lz >= 0) {
                blocks.push({ x: lx, y: ly, z: lz, blockId: 18 })
              }
            }
          }
        }
      }
    }
  }

  return {
    chunkX: cx,
    chunkZ: cz,
    blocks,
    loaded: true,
  }
}

function generateDemoTerrain() {
  const chunks = []
  const chunkSize = 16
  const numChunks = 4

  for (let cz = 0; cz < numChunks; cz++) {
    for (let cx = 0; cx < numChunks; cx++) {
      const blocks = []
      for (let x = 0; x < chunkSize; x++) {
        for (let z = 0; z < chunkSize; z++) {
          const worldX = cx * chunkSize + x
          const worldZ = cz * chunkSize + z
          const height = getTerrainHeight(worldX, worldZ)

          for (let y = 0; y <= height; y++) {
            let blockId
            if (y === 0) {
              blockId = 7
            } else if (y < height - 3) {
              blockId = 1
            } else if (y < height) {
              blockId = 3
            } else {
              if (height < 5) {
                blockId = 12
              } else {
                blockId = 2
              }
            }
            blocks.push({ x: worldX, y, z: worldZ, blockId })
          }

          if (height > 6 && worldX % 7 === 3 && worldZ % 7 === 3 && height < 18) {
            for (let ty = height + 1; ty < height + 5; ty++) {
              blocks.push({ x: worldX, y: ty, z: worldZ, blockId: 17 })
            }
            if (height + 5 > 0) {
              for (let dx = -2; dx <= 2; dx++) {
                for (let dz = -2; dz <= 2; dz++) {
                  for (let dy = 0; dy <= 2; dy++) {
                    const lx = worldX + dx
                    const lz = worldZ + dz
                    const ly = height + 4 + dy
                    const dist = Math.abs(dx) + Math.abs(dz) + dy
                    if (dist <= 3 && lx >= 0 && lz >= 0) {
                      blocks.push({ x: lx, y: ly, z: lz, blockId: 18 })
                    }
                  }
                }
              }
            }
          }
        }
      }

      chunks.push({
        chunkX: cx,
        chunkZ: cz,
        blocks,
        loaded: true,
      })
    }
  }

  return { regionX: 0, regionZ: 0, chunks }
}

function getTerrainHeight(x, z) {
  const s1 = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 8
  const s2 = Math.sin(x * 0.1 + 1.3) * Math.cos(z * 0.08 + 0.7) * 4
  const s3 = Math.sin(x * 0.02) * Math.sin(z * 0.03) * 6
  return Math.floor(10 + s1 + s2 + s3)
}
