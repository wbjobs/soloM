use crate::crypto::{EncryptionService, KeyManager, CryptoError};
use crate::models::{Note, NoteCreate, NoteUpdate};
use crate::sync::protocol::{EncryptedNotePayload, KnownNote};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum DatabaseError {
    #[error("Crypto error: {0}")]
    Crypto(#[from] CryptoError),
    #[error("Database error: {0}")]
    Rusqlite(#[from] rusqlite::Error),
    #[error("Note not found")]
    NotFound,
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Connection broken")]
    ConnectionBroken,
    #[error("Reconnection failed: {0}")]
    ReconnectionFailed(String),
    #[error("Lock poisoned")]
    LockPoisoned,
}

struct DatabaseInner {
    conn: Connection,
    encryption: EncryptionService,
    db_path: PathBuf,
    last_check: std::time::Instant,
}

pub struct Database {
    inner: Mutex<DatabaseInner>,
}

impl Database {
    pub fn new() -> Result<Self, DatabaseError> {
        let app_dir = Self::get_app_dir()?;
        std::fs::create_dir_all(&app_dir)?;
        let db_path = app_dir.join("notes.db");

        let (conn, encryption) = Self::create_connection(&db_path)?;

        Ok(Self {
            inner: Mutex::new(DatabaseInner {
                conn,
                encryption,
                db_path,
                last_check: std::time::Instant::now(),
            }),
        })
    }

    fn create_connection(
        db_path: &Path,
    ) -> Result<(Connection, EncryptionService), DatabaseError> {
        let conn = Connection::open(db_path)?;

        conn.execute("PRAGMA journal_mode = WAL", [])?;
        conn.execute("PRAGMA synchronous = NORMAL", [])?;
        conn.execute("PRAGMA busy_timeout = 30000", [])?;

        let key = KeyManager::get_or_create_encryption_key()?;
        let encryption = EncryptionService::new(&key)?;

        Ok((conn, encryption))
    }

    fn get_app_dir() -> Result<PathBuf, DatabaseError> {
        let mut path = dirs::data_dir().ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::NotFound, "Data directory not found")
        })?;
        path.push("EncryptedNotes");
        Ok(path)
    }

    fn check_connection(inner: &mut DatabaseInner) -> Result<(), DatabaseError> {
        let now = std::time::Instant::now();
        if now.duration_since(inner.last_check) < std::time::Duration::from_secs(5) {
            return Ok(());
        }

        match inner.conn.query_row("SELECT 1", [], |row| row.get::<_, i32>(0)) {
            Ok(1) => {
                inner.last_check = now;
                Ok(())
            }
            _ => Err(DatabaseError::ConnectionBroken),
        }
    }

    fn reconnect(inner: &mut DatabaseInner) -> Result<(), DatabaseError> {
        eprintln!("Database connection lost, attempting to reconnect...");

        for attempt in 1..=5 {
            match Self::create_connection(&inner.db_path) {
                Ok((new_conn, new_encryption)) => {
                    inner.conn = new_conn;
                    inner.encryption = new_encryption;
                    inner.last_check = std::time::Instant::now();
                    eprintln!("Database reconnected successfully on attempt {attempt}");
                    return Ok(());
                }
                Err(e) => {
                    eprintln!("Reconnection attempt {attempt} failed: {e}");
                    if attempt < 5 {
                        std::thread::sleep(std::time::Duration::from_millis(500 * attempt as u64));
                    }
                }
            }
        }

        Err(DatabaseError::ReconnectionFailed(
            "All reconnection attempts failed".to_string(),
        ))
    }

    fn with_connection<F, R>(&self, f: F) -> Result<R, DatabaseError>
    where
        F: FnOnce(&Connection, &EncryptionService) -> Result<R, DatabaseError>,
    {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| DatabaseError::LockPoisoned)?;

        if let Err(_) = Self::check_connection(&mut inner) {
            Self::reconnect(&mut inner)?;
        }

        f(&inner.conn, &inner.encryption)
    }

    pub fn init(&self) -> Result<(), DatabaseError> {
        self.with_connection(|conn, _| {
            conn.execute(
                "CREATE TABLE IF NOT EXISTS notes (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )",
                [],
            )?;

            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at)",
                [],
            )?;

            Ok(())
        })
    }

    pub fn reconnect_all(&self) -> Result<(), DatabaseError> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| DatabaseError::LockPoisoned)?;
        Self::reconnect(&mut inner)
    }

    pub fn create_note(&self, note: NoteCreate) -> Result<Note, DatabaseError> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        self.with_connection(|conn, encryption| {
            let encrypted_title = encryption.encrypt(&note.title)?;
            let encrypted_content = encryption.encrypt(&note.content)?;

            conn.execute(
                "INSERT INTO notes (id, title, content, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![id, encrypted_title, encrypted_content, now, now],
            )?;

            Ok(Note {
                id: id.clone(),
                title: note.title.clone(),
                content: note.content.clone(),
                created_at: now.clone(),
                updated_at: now.clone(),
            })
        })
    }

    pub fn get_notes(&self) -> Result<Vec<Note>, DatabaseError> {
        self.with_connection(|conn, encryption| {
            let mut stmt = conn.prepare(
                "SELECT id, title, content, created_at, updated_at 
                 FROM notes 
                 ORDER BY updated_at DESC",
            )?;

            let notes = stmt.query_map([], |row| {
                let id: String = row.get(0)?;
                let encrypted_title: String = row.get(1)?;
                let encrypted_content: String = row.get(2)?;
                let created_at: String = row.get(3)?;
                let updated_at: String = row.get(4)?;

                let title = encryption
                    .decrypt(&encrypted_title)
                    .unwrap_or_else(|_| "[解密失败]".to_string());
                let content = encryption
                    .decrypt(&encrypted_content)
                    .unwrap_or_else(|_| "[解密失败]".to_string());

                Ok(Note {
                    id,
                    title,
                    content,
                    created_at,
                    updated_at,
                })
            })?;

            Ok(notes.collect::<Result<Vec<_>, _>>()?)
        })
    }

    pub fn get_note_by_id(&self, id: &str) -> Result<Option<Note>, DatabaseError> {
        self.with_connection(|conn, encryption| {
            let mut stmt = conn.prepare(
                "SELECT id, title, content, created_at, updated_at 
                 FROM notes 
                 WHERE id = ?1",
            )?;

            let note = stmt
                .query_row(params![id], |row| {
                    let id: String = row.get(0)?;
                    let encrypted_title: String = row.get(1)?;
                    let encrypted_content: String = row.get(2)?;
                    let created_at: String = row.get(3)?;
                    let updated_at: String = row.get(4)?;

                    let title = encryption
                        .decrypt(&encrypted_title)
                        .unwrap_or_else(|_| "[解密失败]".to_string());
                    let content = encryption
                        .decrypt(&encrypted_content)
                        .unwrap_or_else(|_| "[解密失败]".to_string());

                    Ok(Note {
                        id,
                        title,
                        content,
                        created_at,
                        updated_at,
                    })
                })
                .optional()?;

            Ok(note)
        })
    }

    pub fn update_note(&self, id: &str, note: NoteUpdate) -> Result<Note, DatabaseError> {
        let now = Utc::now().to_rfc3339();

        let current_note = self
            .get_note_by_id(id)?
            .ok_or(DatabaseError::NotFound)?;

        let new_title = note.title.unwrap_or(current_note.title);
        let new_content = note.content.unwrap_or(current_note.content);

        self.with_connection(|conn, encryption| {
            let encrypted_title = encryption.encrypt(&new_title)?;
            let encrypted_content = encryption.encrypt(&new_content)?;

            let result = conn.execute(
                "UPDATE notes 
                 SET title = ?1,
                     content = ?2,
                     updated_at = ?3
                 WHERE id = ?4",
                params![encrypted_title, encrypted_content, now, id],
            )?;

            if result == 0 {
                return Err(DatabaseError::NotFound);
            }

            Ok(Note {
                id: id.to_string(),
                title: new_title.clone(),
                content: new_content.clone(),
                created_at: current_note.created_at.clone(),
                updated_at: now.clone(),
            })
        })
    }

    pub fn delete_note(&self, id: &str) -> Result<bool, DatabaseError> {
        self.with_connection(|conn, _| {
            let result = conn.execute("DELETE FROM notes WHERE id = ?1", params![id])?;
            Ok(result > 0)
        })
    }

    pub fn search_notes(&self, query: &str) -> Result<Vec<Note>, DatabaseError> {
        let all_notes = self.get_notes()?;
        let query_lower = query.to_lowercase();

        let filtered = all_notes
            .into_iter()
            .filter(|note| {
                note.title.to_lowercase().contains(&query_lower)
                    || note.content.to_lowercase().contains(&query_lower)
            })
            .collect();

        Ok(filtered)
    }

    pub fn get_sync_metadata(&self) -> Result<Vec<KnownNote>, DatabaseError> {
        self.with_connection(|conn, _| {
            let mut stmt = conn.prepare(
                "SELECT id, updated_at FROM notes",
            )?;

            let notes = stmt.query_map([], |row| {
                Ok(KnownNote {
                    id: row.get(0)?,
                    updated_at: row.get(1)?,
                })
            })?;

            Ok(notes.collect::<Result<Vec<_>, _>>()?)
        })
    }

    pub fn get_all_encrypted_notes(&self) -> Result<Vec<EncryptedNotePayload>, DatabaseError> {
        self.with_connection(|conn, _| {
            let mut stmt = conn.prepare(
                "SELECT id, title, content, created_at, updated_at FROM notes",
            )?;

            let notes = stmt.query_map([], |row| {
                Ok(EncryptedNotePayload {
                    id: row.get(0)?,
                    encrypted_title: row.get(1)?,
                    encrypted_content: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })?;

            Ok(notes.collect::<Result<Vec<_>, _>>()?)
        })
    }

    pub fn upsert_encrypted_note(
        &self,
        id: &str,
        encrypted_title: &str,
        encrypted_content: &str,
        created_at: &str,
        updated_at: &str,
    ) -> Result<bool, DatabaseError> {
        self.with_connection(|conn, _| {
            let existing: Option<String> = conn
                .query_row(
                    "SELECT updated_at FROM notes WHERE id = ?1",
                    params![id],
                    |row| row.get(0),
                )
                .optional()?
                .flatten();

            if existing.is_some() {
                conn.execute(
                    "UPDATE notes SET title = ?1, content = ?2, updated_at = ?3 WHERE id = ?4",
                    params![encrypted_title, encrypted_content, updated_at, id],
                )?;
            } else {
                conn.execute(
                    "INSERT INTO notes (id, title, content, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![id, encrypted_title, encrypted_content, created_at, updated_at],
                )?;
            }

            Ok(true)
        })
    }

    pub fn upsert_encrypted_note_if_newer(
        &self,
        id: &str,
        encrypted_title: &str,
        encrypted_content: &str,
        created_at: &str,
        updated_at: &str,
    ) -> Result<bool, DatabaseError> {
        self.with_connection(|conn, _| {
            let existing_updated: Option<String> = conn
                .query_row(
                    "SELECT updated_at FROM notes WHERE id = ?1",
                    params![id],
                    |row| row.get(0),
                )
                .optional()?
                .flatten();

            match existing_updated {
                Some(existing) if existing >= updated_at.to_string() => Ok(false),
                _ => {
                    conn.execute(
                        "INSERT OR REPLACE INTO notes (id, title, content, created_at, updated_at)
                         VALUES (?1, ?2, ?3, ?4, ?5)",
                        params![id, encrypted_title, encrypted_content, created_at, updated_at],
                    )?;
                    Ok(true)
                }
            }
        })
    }

    pub fn delete_encrypted_note(&self, id: &str) -> Result<bool, DatabaseError> {
        self.with_connection(|conn, _| {
            let result = conn.execute("DELETE FROM notes WHERE id = ?1", params![id])?;
            Ok(result > 0)
        })
    }

    pub fn get_encrypted_note(&self, id: &str) -> Result<Option<EncryptedNotePayload>, DatabaseError> {
        self.with_connection(|conn, _| {
            let note = conn
                .query_row(
                    "SELECT id, title, content, created_at, updated_at FROM notes WHERE id = ?1",
                    params![id],
                    |row| {
                        Ok(EncryptedNotePayload {
                            id: row.get(0)?,
                            encrypted_title: row.get(1)?,
                            encrypted_content: row.get(2)?,
                            created_at: row.get(3)?,
                            updated_at: row.get(4)?,
                        })
                    },
                )
                .optional()?;
            Ok(note)
        })
    }
}
