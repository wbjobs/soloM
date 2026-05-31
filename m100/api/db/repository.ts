import db from './index.ts';
import { v4 as uuidv4 } from 'uuid';
import { FileMetadata, ChunkIndex, CreateFileRequest } from '../../shared/types.ts';

export function createFileMetadata(req: CreateFileRequest): FileMetadata {
  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO file_metadata 
    (id, fileName, fileSize, mimeType, chunkSize, totalChunks, salt, algorithm, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'uploading', ?, ?)
  `);

  stmt.run(id, req.fileName, req.fileSize, req.mimeType, req.chunkSize, req.totalChunks, req.salt, req.algorithm, now, now);

  return {
    id,
    ...req,
    status: 'uploading',
    createdAt: now,
    updatedAt: now,
  } as FileMetadata;
}

export function getFileMetadataById(id: string): FileMetadata | undefined {
  const stmt = db.prepare('SELECT * FROM file_metadata WHERE id = ?');
  return stmt.get(id) as FileMetadata | undefined;
}

export function getAllFiles(): FileMetadata[] {
  const stmt = db.prepare('SELECT * FROM file_metadata ORDER BY createdAt DESC');
  return stmt.all() as FileMetadata[];
}

export function updateFileStatus(id: string, status: FileMetadata['status']): boolean {
  const stmt = db.prepare(`
    UPDATE file_metadata 
    SET status = ?, updatedAt = datetime('now')
    WHERE id = ?
  `);
  const result = stmt.run(status, id);
  return result.changes > 0;
}

export function deleteFile(id: string): boolean {
  const stmt = db.prepare('DELETE FROM file_metadata WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function createChunkIndex(
  fileId: string,
  chunkIndex: number,
  chunkSize: number,
  encryptedSize: number,
  iv: string,
  storageBackend: string,
  storagePath: string
): ChunkIndex {
  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO chunk_index 
    (id, fileId, chunkIndex, chunkSize, encryptedSize, iv, storageBackend, storagePath, uploadedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, fileId, chunkIndex, chunkSize, encryptedSize, iv, storageBackend, storagePath, now);

  return {
    id,
    fileId,
    chunkIndex,
    chunkSize,
    encryptedSize,
    iv,
    storageBackend: storageBackend as 'local' | 'minio',
    storagePath,
    uploadedAt: now,
  };
}

export function getChunksByFileId(fileId: string): ChunkIndex[] {
  const stmt = db.prepare('SELECT * FROM chunk_index WHERE fileId = ? ORDER BY chunkIndex ASC');
  return stmt.all(fileId) as ChunkIndex[];
}

export function getChunkByFileIdAndIndex(fileId: string, chunkIndex: number): ChunkIndex | undefined {
  const stmt = db.prepare('SELECT * FROM chunk_index WHERE fileId = ? AND chunkIndex = ?');
  return stmt.get(fileId, chunkIndex) as ChunkIndex | undefined;
}

export function getUploadedChunkCount(fileId: string): number {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM chunk_index WHERE fileId = ?');
  const result = stmt.get(fileId) as { count: number };
  return result.count;
}

export function createShareLink(
  fileId: string,
  keyHash: string,
  expiresAt: string | null,
  maxDownloads: number | null
): { id: string; createdAt: string } {
  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO share_links (id, fileId, keyHash, createdAt, expiresAt, maxDownloads)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, fileId, keyHash, now, expiresAt, maxDownloads);

  return { id, createdAt: now };
}

export function getShareLink(id: string): {
  id: string;
  fileId: string;
  keyHash: string;
  createdAt: string;
  expiresAt: string | null;
  downloadCount: number;
  maxDownloads: number | null;
} | undefined {
  const stmt = db.prepare('SELECT * FROM share_links WHERE id = ?');
  return stmt.get(id) as any;
}

export function incrementShareDownloadCount(id: string): boolean {
  const stmt = db.prepare(`
    UPDATE share_links 
    SET downloadCount = downloadCount + 1
    WHERE id = ?
  `);
  const result = stmt.run(id);
  return result.changes > 0;
}

export function deleteShareLinksByFileId(fileId: string): boolean {
  const stmt = db.prepare('DELETE FROM share_links WHERE fileId = ?');
  const result = stmt.run(fileId);
  return result.changes > 0;
}

export function logDestroyAction(
  fileId: string,
  fileName: string,
  chunksDestroyed: number
): string {
  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO destroy_log (id, fileId, fileName, chunksDestroyed, destroyedAt)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(id, fileId, fileName, chunksDestroyed, now);
  return id;
}

export function getDestroyLogs(): Array<{
  id: string;
  fileId: string;
  fileName: string;
  chunksDestroyed: number;
  destroyedAt: string;
}> {
  const stmt = db.prepare('SELECT * FROM destroy_log ORDER BY destroyedAt DESC LIMIT 50');
  return stmt.all() as any;
}
