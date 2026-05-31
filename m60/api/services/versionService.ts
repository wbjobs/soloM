import { randomUUID } from 'crypto'
import type { MapVersion } from '../../shared/types.js'
import * as store from './fileStore.js'
import * as mapService from './mapService.js'

export async function getVersions(mapId: string): Promise<MapVersion[]> {
  return await store.listVersions(mapId)
}

export async function createVersion(mapId: string, description: string): Promise<MapVersion> {
  const map = await mapService.getMapById(mapId)
  const version: MapVersion = {
    id: randomUUID(),
    mapId,
    version: map.version,
    snapshot: map,
    createdAt: new Date().toISOString(),
    description: description || `Version ${map.version}`,
  }
  await store.writeVersion(mapId, version.id, version)
  return version
}

export async function rollbackVersion(mapId: string, versionId: string): Promise<MapVersion> {
  const version = await store.readVersion(mapId, versionId)
  const restored = await mapService.updateMap(mapId, {
    ...version.snapshot,
    version: undefined as any,
  })
  const snapshot: MapVersion = {
    id: randomUUID(),
    mapId,
    version: restored.version,
    snapshot: restored,
    createdAt: new Date().toISOString(),
    description: `Rollback to version ${version.version}`,
  }
  await store.writeVersion(mapId, snapshot.id, snapshot)
  return snapshot
}
