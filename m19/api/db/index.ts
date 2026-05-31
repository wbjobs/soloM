import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/app.db')

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    const dbDir = path.dirname(DB_PATH)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
  }
  return db
}

export function initDb(): void {
  const d = getDb()

  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT UNIQUE NOT NULL,
      nickname TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 100,
      total_earned INTEGER NOT NULL DEFAULT 0,
      total_spent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files (
      cid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      owner_id INTEGER NOT NULL,
      pin_count INTEGER NOT NULL DEFAULT 0,
      reward_level INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS pins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      file_cid TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, file_cid),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (file_cid) REFERENCES files(cid)
    );

    CREATE TABLE IF NOT EXISTS point_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      description TEXT NOT NULL,
      ref_type TEXT,
      ref_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_id);
    CREATE INDEX IF NOT EXISTS idx_files_pin_count ON files(pin_count DESC);
    CREATE INDEX IF NOT EXISTS idx_pins_user ON pins(user_id);
    CREATE INDEX IF NOT EXISTS idx_pins_file ON pins(file_cid);
    CREATE INDEX IF NOT EXISTS idx_tx_user ON point_transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_tx_created ON point_transactions(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_users_points ON users(points DESC);
  `)

  const defaultUser = d.prepare('SELECT id FROM users WHERE id = 1').get()
  if (!defaultUser) {
    const now = new Date().toISOString()
    d.prepare(`
      INSERT INTO users (id, address, nickname, points, total_earned, total_spent, created_at, updated_at)
      VALUES (1, '0x0000000000000000000000000000000000000001', '匿名用户', 999999, 999999, 0, ?, ?)
    `).run(now, now)
  }
}

export default getDb
