import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

const MAPS_DIR = path.join(PROJECT_ROOT, 'server', 'data', 'maps')
const VERSIONS_DIR = path.join(PROJECT_ROOT, 'server', 'data', 'versions')

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

export async function initStorage(): Promise<void> {
  await ensureDir(MAPS_DIR)
  await ensureDir(VERSIONS_DIR)
}

export async function readMap(id: string): Promise<any> {
  const filePath = path.join(MAPS_DIR, `${id}.json`)
  const raw = await fs.readFile(filePath, 'utf-8')
  return JSON.parse(raw)
}

export async function writeMap(id: string, data: any): Promise<void> {
  const filePath = path.join(MAPS_DIR, `${id}.json`)
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

export async function listMaps(): Promise<any[]> {
  await ensureDir(MAPS_DIR)
  const files = await fs.readdir(MAPS_DIR)
  const maps: any[] = []
  for (const file of files) {
    if (file.endsWith('.json')) {
      const raw = await fs.readFile(path.join(MAPS_DIR, file), 'utf-8')
      maps.push(JSON.parse(raw))
    }
  }
  return maps
}

export async function deleteMapFile(id: string): Promise<void> {
  const filePath = path.join(MAPS_DIR, `${id}.json`)
  await fs.unlink(filePath)
}

export async function readVersion(mapId: string, versionId: string): Promise<any> {
  const filePath = path.join(VERSIONS_DIR, mapId, `${versionId}.json`)
  const raw = await fs.readFile(filePath, 'utf-8')
  return JSON.parse(raw)
}

export async function writeVersion(mapId: string, versionId: string, data: any): Promise<void> {
  const dir = path.join(VERSIONS_DIR, mapId)
  await ensureDir(dir)
  const filePath = path.join(dir, `${versionId}.json`)
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

export async function listVersions(mapId: string): Promise<any[]> {
  const dir = path.join(VERSIONS_DIR, mapId)
  await ensureDir(dir)
  const files = await fs.readdir(dir)
  const versions: any[] = []
  for (const file of files) {
    if (file.endsWith('.json')) {
      const raw = await fs.readFile(path.join(dir, file), 'utf-8')
      versions.push(JSON.parse(raw))
    }
  }
  return versions
}

export async function deleteVersionsDir(mapId: string): Promise<void> {
  const dir = path.join(VERSIONS_DIR, mapId)
  try {
    await fs.rm(dir, { recursive: true, force: true })
  } catch {
    // directory may not exist
  }
}
