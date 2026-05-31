export interface FileRecord {
  cid: string
  name: string
  size: number
  mimeType: string
  uploadedAt: string
}

const store: FileRecord[] = []

export function addFile(record: FileRecord): void {
  const existing = store.findIndex((f) => f.cid === record.cid)
  if (existing >= 0) {
    store[existing] = record
  } else {
    store.unshift(record)
  }
}

export function getAllFiles(): FileRecord[] {
  return [...store]
}

export function getFileByCid(cid: string): FileRecord | undefined {
  return store.find((f) => f.cid === cid)
}

export function deleteFileByCid(cid: string): boolean {
  const index = store.findIndex((f) => f.cid === cid)
  if (index < 0) return false
  store.splice(index, 1)
  return true
}
