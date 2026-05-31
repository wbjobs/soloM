import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import type { AuditLogEntry, SecurityAlert, SyscallEvent } from '@shared/types'

let db: Database.Database | null = null

export function initAuditDatabase(): Database.Database {
  if (db) return db

  const dbPath = path.join(app.getPath('userData'), 'audit-log.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      syscall TEXT NOT NULL,
      pid INTEGER NOT NULL,
      ppid INTEGER NOT NULL,
      comm TEXT NOT NULL,
      uid INTEGER NOT NULL,
      gid INTEGER NOT NULL,
      args TEXT,
      retval INTEGER,
      duration INTEGER,
      rule_id TEXT,
      rule_name TEXT,
      severity TEXT,
      alert_triggered INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_syscall ON audit_logs(syscall);
    CREATE INDEX IF NOT EXISTS idx_audit_pid ON audit_logs(pid);
    CREATE INDEX IF NOT EXISTS idx_audit_severity ON audit_logs(severity);
    CREATE INDEX IF NOT EXISTS idx_audit_alert ON audit_logs(alert_triggered);

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      rule_id TEXT NOT NULL,
      rule_name TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      event_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp);
    CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
    CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged);
  `)

  return db
}

export function getAuditDatabase(): Database.Database {
  if (!db) {
    return initAuditDatabase()
  }
  return db
}

export function closeAuditDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function insertAuditLog(entry: AuditLogEntry): void {
  const database = getAuditDatabase()
  const stmt = database.prepare(`
    INSERT INTO audit_logs (
      id, timestamp, syscall, pid, ppid, comm, uid, gid,
      args, retval, duration, rule_id, rule_name, severity, alert_triggered
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    entry.id,
    entry.timestamp,
    entry.event.syscall,
    entry.event.pid,
    entry.event.ppid,
    entry.event.comm,
    entry.event.uid,
    entry.event.gid,
    JSON.stringify(entry.event.args),
    entry.event.retval,
    entry.event.duration,
    entry.ruleId,
    entry.ruleName,
    entry.severity,
    entry.alertTriggered ? 1 : 0
  )
}

export function insertAuditLogBatch(entries: AuditLogEntry[]): void {
  if (entries.length === 0) return

  const database = getAuditDatabase()
  const stmt = database.prepare(`
    INSERT INTO audit_logs (
      id, timestamp, syscall, pid, ppid, comm, uid, gid,
      args, retval, duration, rule_id, rule_name, severity, alert_triggered
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertMany = database.transaction((logs: AuditLogEntry[]) => {
    for (const entry of logs) {
      stmt.run(
        entry.id,
        entry.timestamp,
        entry.event.syscall,
        entry.event.pid,
        entry.event.ppid,
        entry.event.comm,
        entry.event.uid,
        entry.event.gid,
        JSON.stringify(entry.event.args),
        entry.event.retval,
        entry.event.duration,
        entry.ruleId,
        entry.ruleName,
        entry.severity,
        entry.alertTriggered ? 1 : 0
      )
    }
  })

  insertMany(entries)
}

export function insertAlert(alert: SecurityAlert): void {
  const database = getAuditDatabase()
  const stmt = database.prepare(`
    INSERT INTO alerts (id, rule_id, rule_name, severity, message, event_id, timestamp, acknowledged)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `)

  stmt.run(
    alert.id,
    alert.ruleId,
    alert.ruleName,
    alert.severity,
    alert.message,
    alert.id,
    alert.timestamp
  )
}

export interface AuditLogQueryOptions {
  limit?: number
  offset?: number
  startTime?: number
  endTime?: number
  syscall?: string
  pid?: number
  severity?: string
  alertOnly?: boolean
}

export function queryAuditLogs(options: AuditLogQueryOptions = {}): AuditLogEntry[] {
  const database = getAuditDatabase()
  let sql = 'SELECT * FROM audit_logs WHERE 1=1'
  const params: any[] = []

  if (options.startTime) {
    sql += ' AND timestamp >= ?'
    params.push(options.startTime)
  }
  if (options.endTime) {
    sql += ' AND timestamp <= ?'
    params.push(options.endTime)
  }
  if (options.syscall) {
    sql += ' AND syscall = ?'
    params.push(options.syscall)
  }
  if (options.pid) {
    sql += ' AND pid = ?'
    params.push(options.pid)
  }
  if (options.severity) {
    sql += ' AND severity = ?'
    params.push(options.severity)
  }
  if (options.alertOnly) {
    sql += ' AND alert_triggered = 1'
  }

  sql += ' ORDER BY timestamp DESC'

  if (options.limit) {
    sql += ' LIMIT ?'
    params.push(options.limit)
  }
  if (options.offset) {
    sql += ' OFFSET ?'
    params.push(options.offset)
  }

  const rows = database.prepare(sql).all(...params) as any[]

  return rows.map((row) => ({
    id: row.id,
    event: {
      timestamp: row.timestamp,
      syscall: row.syscall,
      pid: row.pid,
      ppid: row.ppid,
      comm: row.comm,
      uid: row.uid,
      gid: row.gid,
      args: JSON.parse(row.args || '{}'),
      retval: row.retval,
      duration: row.duration,
    } as SyscallEvent,
    ruleId: row.rule_id,
    ruleName: row.rule_name,
    severity: row.severity,
    alertTriggered: row.alert_triggered === 1,
    timestamp: row.timestamp,
  }))
}

export function getAlertCount(): number {
  const database = getAuditDatabase()
  const row = database.prepare('SELECT COUNT(*) as count FROM alerts WHERE acknowledged = 0').get() as any
  return row?.count || 0
}

export function acknowledgeAlert(alertId: string): void {
  const database = getAuditDatabase()
  database.prepare('UPDATE alerts SET acknowledged = 1 WHERE id = ?').run(alertId)
}

export function acknowledgeAllAlerts(): void {
  const database = getAuditDatabase()
  database.prepare('UPDATE alerts SET acknowledged = 1').run()
}

export function getAuditStats() {
  const database = getAuditDatabase()
  const totalLogs = (database.prepare('SELECT COUNT(*) as count FROM audit_logs').get() as any)?.count || 0
  const totalAlerts = (database.prepare('SELECT COUNT(*) as count FROM alerts').get() as any)?.count || 0
  const unacknowledgedAlerts = getAlertCount()

  const severityCounts = database.prepare(`
    SELECT severity, COUNT(*) as count
    FROM alerts
    WHERE acknowledged = 0
    GROUP BY severity
  `).all() as any[]

  return {
    totalLogs,
    totalAlerts,
    unacknowledgedAlerts,
    severityCounts: severityCounts.map((s) => ({ severity: s.severity, count: s.count })),
  }
}

export function cleanupOldAuditLogs(maxAgeDays: number = 30): number {
  const database = getAuditDatabase()
  const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000

  const result = database.prepare('DELETE FROM audit_logs WHERE timestamp < ?').run(cutoffTime)
  database.prepare('DELETE FROM alerts WHERE timestamp < ?').run(cutoffTime)

  return result.changes || 0
}
