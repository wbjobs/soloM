import { getDb } from '../db/index.js'
import { updateUserPoints } from './user.service.js'

export interface FileRecord {
  cid: string
  name: string
  size: number
  mime_type: string
  owner_id: number
  pin_count: number
  reward_level: number
  created_at: string
}

export function addFile(
  cid: string,
  name: string,
  size: number,
  mimeType: string,
  ownerId: number,
): FileRecord {
  const db = getDb()
  const now = new Date().toISOString()

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO files (cid, name, size, mime_type, owner_id, pin_count, reward_level, created_at)
    VALUES (?, ?, ?, ?, ?, COALESCE((SELECT pin_count FROM files WHERE cid = ?), 0), 0, ?)
  `)
  stmt.run(cid, name, size, mimeType, ownerId, cid, now)

  return getFileByCid(cid)!
}

export function getFileByCid(cid: string): FileRecord | null {
  const db = getDb()
  const stmt = db.prepare('SELECT * FROM files WHERE cid = ?')
  const row = stmt.get(cid) as FileRecord | undefined
  return row || null
}

export function getAllFiles(): FileRecord[] {
  const db = getDb()
  const stmt = db.prepare(`
    SELECT f.*, u.nickname as owner_nickname
    FROM files f
    LEFT JOIN users u ON f.owner_id = u.id
    ORDER BY f.created_at DESC
  `)
  return stmt.all() as (FileRecord & { owner_nickname: string })[]
}

export function getFilesWithPins(userId?: number): any[] {
  const db = getDb()
  let stmt
  if (userId) {
    stmt = db.prepare(`
      SELECT f.cid, f.name, f.size, f.mime_type as mimeType, f.owner_id, f.pin_count, f.reward_level,
             f.created_at as uploadedAt, u.nickname as owner_nickname,
             f.owner_id = ? as is_owner,
             EXISTS(SELECT 1 FROM pins p WHERE p.file_cid = f.cid AND p.user_id = ?) as is_pinned
      FROM files f
      LEFT JOIN users u ON f.owner_id = u.id
      ORDER BY f.pin_count DESC, f.created_at DESC
    `)
    return stmt.all(userId, userId)
  } else {
    stmt = db.prepare(`
      SELECT f.cid, f.name, f.size, f.mime_type as mimeType, f.owner_id, f.pin_count, f.reward_level,
             f.created_at as uploadedAt, u.nickname as owner_nickname
      FROM files f
      LEFT JOIN users u ON f.owner_id = u.id
      ORDER BY f.pin_count DESC, f.created_at DESC
    `)
    return stmt.all()
  }
}

export function pinFile(userId: number, cid: string): { success: boolean; pointsEarned: number; message: string } {
  const db = getDb()
  const file = getFileByCid(cid)

  if (!file) {
    return { success: false, pointsEarned: 0, message: '文件不存在' }
  }

  if (file.owner_id === userId) {
    return { success: false, pointsEarned: 0, message: '不能 Pin 自己的文件' }
  }

  const existingPin = db.prepare('SELECT id FROM pins WHERE user_id = ? AND file_cid = ?').get(userId, cid)
  if (existingPin) {
    return { success: false, pointsEarned: 0, message: '已经 Pin 过此文件' }
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayCount = db.prepare(`
    SELECT COUNT(*) as count FROM pins
    WHERE user_id = ? AND created_at >= ?
  `).get(userId, todayStart.toISOString()) as { count: number }

  if (todayCount.count >= 10) {
    return { success: false, pointsEarned: 0, message: '今日 Pin 次数已达上限（10次）' }
  }

  const now = new Date().toISOString()
  const pinStmt = db.prepare('INSERT INTO pins (user_id, file_cid, created_at) VALUES (?, ?, ?)')
  pinStmt.run(userId, cid, now)

  const updateStmt = db.prepare('UPDATE files SET pin_count = pin_count + 1 WHERE cid = ?')
  updateStmt.run(cid)

  const pointsEarned = 10
  updateUserPoints(userId, pointsEarned, 'earn', `Pin 文件 ${cid.slice(0, 12)}...`, 'pin', cid)

  return { success: true, pointsEarned, message: `Pin 成功，获得 ${pointsEarned} 积分` }
}

export function getPinsByUser(userId: number): any[] {
  const db = getDb()
  const stmt = db.prepare(`
    SELECT p.*, f.name, f.size, f.mime_type, f.pin_count, u.nickname as owner_nickname
    FROM pins p
    JOIN files f ON p.file_cid = f.cid
    LEFT JOIN users u ON f.owner_id = u.id
    WHERE p.user_id = ?
    ORDER BY p.created_at DESC
  `)
  return stmt.all(userId)
}

export function purchaseReward(cid: string, userId: number, level: number): { success: boolean; cost: number; message: string } {
  const costs: Record<number, number> = { 1: 50, 2: 200 }
  const cost = costs[level]

  if (!cost) {
    return { success: false, cost: 0, message: '无效的奖励等级' }
  }

  const file = getFileByCid(cid)
  if (!file) {
    return { success: false, cost: 0, message: '文件不存在' }
  }

  if (file.owner_id !== userId) {
    return { success: false, cost: 0, message: '只能为自己的文件购买奖励' }
  }

  if (file.reward_level >= level) {
    return { success: false, cost: 0, message: '已达到或超过此等级' }
  }

  const ok = updateUserPoints(userId, -cost, 'spend', `购买等级 ${level} Pin 保障`, 'reward', cid)
  if (!ok) {
    return { success: false, cost: 0, message: '积分不足' }
  }

  const db = getDb()
  db.prepare('UPDATE files SET reward_level = ? WHERE cid = ?').run(level, cid)

  return { success: true, cost, message: `购买成功，消耗 ${cost} 积分` }
}

export function deleteFileRecord(cid: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM files WHERE cid = ?').run(cid)
  return result.changes > 0
}
