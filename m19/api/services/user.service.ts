import { getDb } from '../db/index.js'
import crypto from 'crypto'

export interface User {
  id: number
  address: string
  nickname: string
  points: number
  total_earned: number
  total_spent: number
  created_at: string
  updated_at: string
}

function generateAddress(): string {
  return '0x' + crypto.randomBytes(20).toString('hex')
}

export function createUser(nickname: string): User {
  const db = getDb()
  const address = generateAddress()
  const now = new Date().toISOString()

  const stmt = db.prepare(`
    INSERT INTO users (address, nickname, points, total_earned, total_spent, created_at, updated_at)
    VALUES (?, ?, 100, 100, 0, ?, ?)
  `)

  const result = stmt.run(address, nickname, now, now)
  const id = result.lastInsertRowid as number

  const txStmt = db.prepare(`
    INSERT INTO point_transactions (user_id, type, amount, description, ref_type, ref_id, created_at)
    VALUES (?, 'earn', 100, '新用户注册奖励', 'register', ?, ?)
  `)
  txStmt.run(id, String(id), now)

  return {
    id,
    address,
    nickname,
    points: 100,
    total_earned: 100,
    total_spent: 0,
    created_at: now,
    updated_at: now,
  }
}

export function getUserById(id: number): User | null {
  const db = getDb()
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?')
  const row = stmt.get(id) as User | undefined
  return row || null
}

export function getUserByAddress(address: string): User | null {
  const db = getDb()
  const stmt = db.prepare('SELECT * FROM users WHERE address = ?')
  const row = stmt.get(address) as User | undefined
  return row || null
}

export function updateUserPoints(
  userId: number,
  delta: number,
  type: 'earn' | 'spend',
  description: string,
  refType?: string,
  refId?: string,
): boolean {
  const db = getDb()
  const now = new Date().toISOString()

  const user = getUserById(userId)
  if (!user) return false

  if (type === 'spend' && user.points + delta < 0) {
    return false
  }

  const updateStmt = db.prepare(`
    UPDATE users
    SET points = points + ?,
        total_earned = total_earned + CASE WHEN ? > 0 THEN ? ELSE 0 END,
        total_spent = total_spent + CASE WHEN ? < 0 THEN ABS(?) ELSE 0 END,
        updated_at = ?
    WHERE id = ?
  `)
  updateStmt.run(delta, delta, Math.max(0, delta), delta, Math.abs(Math.min(0, delta)), now, userId)

  const txStmt = db.prepare(`
    INSERT INTO point_transactions (user_id, type, amount, description, ref_type, ref_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  txStmt.run(userId, type, Math.abs(delta), description, refType || null, refId || null, now)

  return true
}

export function getTopUsers(limit: number = 10): User[] {
  const db = getDb()
  const stmt = db.prepare('SELECT * FROM users ORDER BY points DESC LIMIT ?')
  return stmt.all(limit) as User[]
}

export function getUserTransactions(userId: number, limit: number = 20): any[] {
  const db = getDb()
  const stmt = db.prepare(`
    SELECT * FROM point_transactions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `)
  return stmt.all(userId, limit)
}
