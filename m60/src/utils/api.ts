import type { TileMap, CreateMapRequest, MapVersion, Layer, LayerType } from '../../shared/types'

const BASE_URL = '/api'

interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || `API Error: ${response.status}`)
  }
  const body: ApiResponse<T> = await response.json()
  if (!body.success) {
    throw new Error(body.error || 'Unknown error')
  }
  return body.data
}

export function fetchMaps(): Promise<TileMap[]> {
  return request<TileMap[]>('/maps')
}

export function fetchMap(id: string): Promise<TileMap> {
  return request<TileMap>(`/maps/${id}`)
}

export function createMap(data: CreateMapRequest): Promise<TileMap> {
  return request<TileMap>('/maps', { method: 'POST', body: JSON.stringify(data) })
}

export function updateMap(id: string, data: Partial<TileMap>): Promise<TileMap> {
  return request<TileMap>(`/maps/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteMap(id: string): Promise<void> {
  return request<void>(`/maps/${id}`, { method: 'DELETE' })
}

export function duplicateMap(id: string): Promise<TileMap> {
  return request<TileMap>(`/maps/${id}/duplicate`, { method: 'POST' })
}

export function importMap(data: Partial<TileMap>): Promise<TileMap> {
  return request<TileMap>('/maps/import', { method: 'POST', body: JSON.stringify(data) })
}

export function exportMap(id: string): Promise<TileMap> {
  return request<TileMap>(`/maps/${id}/export`)
}

export function fetchVersions(mapId: string): Promise<MapVersion[]> {
  return request<MapVersion[]>(`/maps/${mapId}/versions`)
}

export function createVersion(mapId: string, description: string): Promise<MapVersion> {
  return request<MapVersion>(`/maps/${mapId}/versions`, {
    method: 'POST',
    body: JSON.stringify({ description }),
  })
}

export function rollbackVersion(mapId: string, versionId: string): Promise<TileMap> {
  return request<TileMap>(`/maps/${mapId}/versions/${versionId}/rollback`, { method: 'POST' })
}

export function addLayer(mapId: string, data: { name: string; type: LayerType }): Promise<Layer> {
  return request<Layer>(`/maps/${mapId}/layers`, { method: 'POST', body: JSON.stringify(data) })
}

export function updateLayer(mapId: string, layerId: string, updates: Partial<Layer>): Promise<Layer> {
  return request<Layer>(`/maps/${mapId}/layers/${layerId}`, { method: 'PUT', body: JSON.stringify(updates) })
}

export function deleteLayer(mapId: string, layerId: string): Promise<void> {
  return request<void>(`/maps/${mapId}/layers/${layerId}`, { method: 'DELETE' })
}

export function reorderLayers(mapId: string, orders: { layerId: string; order: number }[]): Promise<Layer[]> {
  return request<Layer[]>(`/maps/${mapId}/layers/reorder`, { method: 'PUT', body: JSON.stringify({ orders }) })
}
