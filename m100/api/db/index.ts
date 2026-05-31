import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'securevault.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_metadata (
      id TEXT PRIMARY KEY,
      fileName TEXT NOT NULL,
      fileSize INTEGER NOT NULL,
      mimeType TEXT NOT NULL,
      chunkSize INTEGER NOT NULL,
      totalChunks INTEGER NOT NULL,
      salt TEXT NOT NULL,
      algorithm TEXT NOT NULL DEFAULT 'AES-GCM-256',
      status TEXT NOT NULL DEFAULT 'uploading',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chunk_index (
      id TEXT PRIMARY KEY,
      fileId TEXT NOT NULL REFERENCES file_metadata(id) ON DELETE CASCADE,
      chunkIndex INTEGER NOT NULL,
      chunkSize INTEGER NOT NULL,
      encryptedSize INTEGER NOT NULL,
      iv TEXT NOT NULL,
      storageBackend TEXT NOT NULL DEFAULT 'local',
      storagePath TEXT NOT NULL,
      uploadedAt TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(fileId, chunkIndex)
    );

    CREATE TABLE IF NOT EXISTS share_links (
      id TEXT PRIMARY KEY,
      fileId TEXT NOT NULL REFERENCES file_metadata(id) ON DELETE CASCADE,
      keyHash TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      expiresAt TEXT,
      downloadCount INTEGER NOT NULL DEFAULT 0,
      maxDownloads INTEGER
    );

    CREATE TABLE IF NOT EXISTS destroy_log (
      id TEXT PRIMARY KEY,
      fileId TEXT NOT NULL,
      fileName TEXT NOT NULL,
      chunksDestroyed INTEGER NOT NULL,
      destroyedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_chunk_fileId ON chunk_index(fileId);
    CREATE INDEX IF NOT EXISTS idx_file_status ON file_metadata(status);
    CREATE INDEX IF NOT EXISTS idx_share_fileId ON share_links(fileId);
  `);

  console.log('Database initialized at:', dbPath);
}

export default db;
