import { randomUUID } from 'crypto'
import type { TileMap, Layer, LayerType, CreateMapRequest } from '../../shared/types.js'
import * as store from './fileStore.js'

function createDefaultLayers(width: number, height: number): Layer[] {
  const size = width * height
  return [
    {
      id: randomUUID(),
      name: 'Ground',
      type: 'ground',
      visible: true,
      locked: false,
      data: new Array(size).fill(0),
      order: 0,
    },
    {
      id: randomUUID(),
      name: 'Objects',
      type: 'objects',
      visible: true,
      locked: false,
      data: new Array(size).fill(0),
      order: 1,
    },
    {
      id: randomUUID(),
      name: 'Sky',
      type: 'sky',
      visible: true,
      locked: false,
      data: new Array(size).fill(0),
      order: 2,
    },
    {
      id: randomUUID(),
      name: 'Collision',
      type: 'collision',
      visible: true,
      locked: false,
      data: new Array(size).fill(0),
      order: 3,
    },
  ]
}

export async function getAllMaps(): Promise<Omit<TileMap, 'layers'>[]> {
  const maps = await store.listMaps()
  return maps.map(({ layers, ...rest }) => rest)
}

export async function getMapById(id: string): Promise<TileMap> {
  return await store.readMap(id)
}

export async function createMap(data: CreateMapRequest): Promise<TileMap> {
  const now = new Date().toISOString()
  const map: TileMap = {
    id: randomUUID(),
    name: data.name,
    width: data.width,
    height: data.height,
    tileWidth: data.tileWidth,
    tileHeight: data.tileHeight,
    layers: createDefaultLayers(data.width, data.height),
    events: [],
    spawnPoint: { x: 0, y: 0 },
    createdAt: now,
    updatedAt: now,
    version: 1,
  }
  await store.writeMap(map.id, map)
  return map
}

export async function updateMap(id: string, data: Partial<TileMap>): Promise<TileMap> {
  const existing = await store.readMap(id)
  const updated: TileMap = {
    ...existing,
    ...data,
    id: existing.id,
    createdAt: existing.createdAt,
    version: existing.version + 1,
    updatedAt: new Date().toISOString(),
  }
  await store.writeMap(id, updated)
  return updated
}

export async function deleteMap(id: string): Promise<void> {
  await store.deleteMapFile(id)
  await store.deleteVersionsDir(id)
}

export async function duplicateMap(id: string): Promise<TileMap> {
  const existing = await store.readMap(id)
  const now = new Date().toISOString()
  const duplicated: TileMap = {
    ...existing,
    id: randomUUID(),
    name: `${existing.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
    version: 1,
    layers: existing.layers.map((layer) => ({
      ...layer,
      id: randomUUID(),
      data: [...layer.data],
    })),
    events: existing.events.map((event) => ({
      ...event,
      id: randomUUID(),
    })),
  }
  await store.writeMap(duplicated.id, duplicated)
  return duplicated
}

export async function importMap(data: TileMap): Promise<TileMap> {
  const now = new Date().toISOString()
  const map: TileMap = {
    ...data,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    version: 1,
  }
  await store.writeMap(map.id, map)
  return map
}

export async function exportMap(id: string): Promise<TileMap> {
  return await store.readMap(id)
}

export async function addLayer(mapId: string, layerData: { name: string; type: LayerType }): Promise<Layer> {
  const map = await store.readMap(mapId)
  const size = map.width * map.height
  const maxOrder = map.layers.reduce((max, layer) => Math.max(max, layer.order), -1)
  const newLayer: Layer = {
    id: randomUUID(),
    name: layerData.name,
    type: layerData.type,
    visible: true,
    locked: false,
    data: new Array(size).fill(0),
    order: maxOrder + 1,
  }
  map.layers.push(newLayer)
  map.updatedAt = new Date().toISOString()
  map.version += 1
  await store.writeMap(mapId, map)
  return newLayer
}

export async function updateLayer(mapId: string, layerId: string, updates: Partial<Layer>): Promise<Layer> {
  const map = await store.readMap(mapId)
  const layerIndex = map.layers.findIndex((l) => l.id === layerId)
  if (layerIndex === -1) {
    throw new Error('Layer not found')
  }
  map.layers[layerIndex] = {
    ...map.layers[layerIndex],
    ...updates,
    id: map.layers[layerIndex].id,
    type: map.layers[layerIndex].type,
    data: map.layers[layerIndex].data,
  }
  map.updatedAt = new Date().toISOString()
  map.version += 1
  await store.writeMap(mapId, map)
  return map.layers[layerIndex]
}

export async function deleteLayer(mapId: string, layerId: string): Promise<void> {
  const map = await store.readMap(mapId)
  const layer = map.layers.find((l) => l.id === layerId)
  if (!layer) {
    throw new Error('Layer not found')
  }
  if (layer.type === 'collision') {
    throw new Error('Cannot delete collision layer')
  }
  map.layers = map.layers.filter((l) => l.id !== layerId)
  map.updatedAt = new Date().toISOString()
  map.version += 1
  await store.writeMap(mapId, map)
}

export async function reorderLayers(mapId: string, layerOrders: { id: string; order: number }[]): Promise<Layer[]> {
  const map = await store.readMap(mapId)
  layerOrders.forEach(({ id, order }) => {
    const layer = map.layers.find((l) => l.id === id)
    if (layer) {
      layer.order = order
    }
  })
  map.updatedAt = new Date().toISOString()
  map.version += 1
  await store.writeMap(mapId, map)
  return map.layers
}
