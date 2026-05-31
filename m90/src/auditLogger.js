const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');

class AuditLogger {
  constructor(dbPath = null) {
    this.dbPath = dbPath || this.getDefaultDbPath();
    this.db = null;
    this.ensureDbDirectory();
  }

  getDefaultDbPath() {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    return path.join(homeDir, '.cluster-audit', 'audit.db');
  }

  ensureDbDirectory() {
    const fs = require('fs');
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async init() {
    await this.connect();
    await this.createTables();
  }

  createTables() {
    return new Promise((resolve, reject) => {
      const sql = `
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          command TEXT NOT NULL,
          servers TEXT NOT NULL,
          results TEXT NOT NULL,
          success INTEGER NOT NULL DEFAULT 0,
          concurrency INTEGER NOT NULL DEFAULT 5,
          executed_by TEXT NOT NULL,
          executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;
      
      this.db.run(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async logCommand(command, servers, results, concurrency = 5) {
    if (!this.db) {
      await this.init();
    }

    const executedBy = os.userInfo().username || 'unknown';
    const serverNames = servers.map(s => s.name || s.host).join(', ');
    const successCount = results.filter(r => r.success).length;
    const allSuccess = successCount === results.length;

    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO audit_logs 
        (command, servers, results, success, concurrency, executed_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      const params = [
        command,
        serverNames,
        JSON.stringify(results),
        allSuccess ? 1 : 0,
        concurrency,
        executedBy,
      ];

      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  async getLogs(limit = 50, offset = 0) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, command, servers, success, executed_by, executed_at
        FROM audit_logs
        ORDER BY executed_at DESC
        LIMIT ? OFFSET ?
      `;
      
      this.db.all(sql, [limit, offset], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getLogById(id) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM audit_logs WHERE id = ?
      `;
      
      this.db.get(sql, [id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async searchLogs(keyword, limit = 50) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, command, servers, success, executed_by, executed_at
        FROM audit_logs
        WHERE command LIKE ? OR servers LIKE ? OR executed_by LIKE ?
        ORDER BY executed_at DESC
        LIMIT ?
      `;
      
      const searchTerm = `%${keyword}%`;
      this.db.all(sql, [searchTerm, searchTerm, searchTerm, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async deleteLog(id) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM audit_logs WHERE id = ?';
      
      this.db.run(sql, [id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  async clearLogs(days = null) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      let sql = 'DELETE FROM audit_logs';
      let params = [];

      if (days) {
        sql += ' WHERE executed_at < datetime("now", "-' + days + ' days")';
      }
      
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            this.db = null;
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = AuditLogger;
