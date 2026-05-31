mod crypto;
mod database;
mod models;
mod power;
mod sync;

use database::Database;
use models::{Note, NoteCreate, NoteUpdate};
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use sync::{SyncHandle, SyncStatus, protocol::EncryptedNotePayload};
use tauri::{State, Manager, Emitter};
use tokio::sync::{mpsc, Mutex as TokioMutex};

struct AppState {
    db: Mutex<Option<Database>>,
    is_connected: AtomicBool,
    last_error: Mutex<Option<String>>,
    wakeup_tx: Mutex<Option<mpsc::Sender<()>>>,
    sync_handle: TokioMutex<Option<SyncHandle>>,
    sync_db: TokioMutex<Option<Database>>,
}

impl AppState {
    fn new() -> Self {
        Self {
            db: Mutex::new(None),
            is_connected: AtomicBool::new(false),
            last_error: Mutex::new(None),
            wakeup_tx: Mutex::new(None),
            sync_handle: TokioMutex::new(None),
            sync_db: TokioMutex::new(None),
        }
    }

    fn set_connected(&self, connected: bool) {
        self.is_connected.store(connected, Ordering::SeqCst);
    }

    fn is_connected(&self) -> bool {
        self.is_connected.load(Ordering::SeqCst)
    }

    fn set_error(&self, error: Option<String>) {
        *self.last_error.lock().unwrap() = error;
    }

    fn get_error(&self) -> Option<String> {
        self.last_error.lock().unwrap().clone()
    }
}

#[derive(Debug, Clone, serde::Serialize)]
struct ConnectionStatus {
    connected: bool,
    error: Option<String>,
}

fn with_retry<F, T>(f: F, max_attempts: u32) -> Result<T, String>
where
    F: Fn() -> Result<T, String>,
{
    let mut last_error = None;
    for attempt in 1..=max_attempts {
        match f() {
            Ok(result) => return Ok(result),
            Err(e) => {
                last_error = Some(e.clone());
                if attempt < max_attempts {
                    eprintln!("Attempt {attempt} failed: {e}, retrying...");
                    std::thread::sleep(std::time::Duration::from_millis(100 * attempt as u64));
                }
            }
        }
    }
    Err(last_error.unwrap_or_else(|| "Unknown error".to_string()))
}

#[tauri::command]
async fn initialize_database(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    eprintln!("Initializing database...");

    let result = with_retry(
        || {
            let db = Database::new().map_err(|e| e.to_string())?;
            db.init().map_err(|e| e.to_string())?;
            Ok(db)
        },
        3,
    );

    match result {
        Ok(db) => {
            *state.db.lock().unwrap() = Some(db);
            state.set_connected(true);
            state.set_error(None);
            app.emit("connection-status", ConnectionStatus {
                connected: true,
                error: None,
            }).ok();

            #[cfg(target_os = "linux")]
            {
                let app_clone = app.clone();
                let state_clone = Arc::new(state.inner().clone());
                let (tx, rx) = mpsc::channel::<()>(1);
                *state.wakeup_tx.lock().unwrap() = Some(tx);

                tokio::spawn(async move {
                    power::linux::monitor_power_events(app_clone, state_clone, rx).await;
                });
            }

            eprintln!("Database initialized successfully");
            Ok("Database initialized successfully".to_string())
        }
        Err(e) => {
            state.set_connected(false);
            state.set_error(Some(e.clone()));
            app.emit("connection-status", ConnectionStatus {
                connected: false,
                error: Some(e.clone()),
            }).ok();
            Err(e)
        }
    }
}

#[tauri::command]
async fn reconnect_database(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    eprintln!("Attempting to reconnect database...");
    state.set_connected(false);

    let result = with_retry(
        || {
            let db = Database::new().map_err(|e| e.to_string())?;
            db.init().map_err(|e| e.to_string())?;
            Ok(db)
        },
        5,
    );

    match result {
        Ok(db) => {
            *state.db.lock().unwrap() = Some(db);
            state.set_connected(true);
            state.set_error(None);
            app.emit("connection-status", ConnectionStatus {
                connected: true,
                error: None,
            }).ok();
            eprintln!("Database reconnected successfully");
            Ok("Database reconnected successfully".to_string())
        }
        Err(e) => {
            state.set_error(Some(e.clone()));
            app.emit("connection-status", ConnectionStatus {
                connected: false,
                error: Some(e.clone()),
            }).ok();
            Err(e)
        }
    }
}

#[tauri::command]
async fn get_connection_status(state: State<'_, AppState>) -> ConnectionStatus {
    ConnectionStatus {
        connected: state.is_connected(),
        error: state.get_error(),
    }
}

#[tauri::command]
async fn health_check(state: State<'_, AppState>) -> bool {
    if !state.is_connected() {
        return false;
    }

    let db_guard = state.db.lock().unwrap();
    let db = match db_guard.as_ref() {
        Some(db) => db,
        None => return false,
    };

    match db.reconnect_all() {
        Ok(_) => {
            state.set_connected(true);
            state.set_error(None);
            true
        }
        Err(e) => {
            state.set_connected(false);
            state.set_error(Some(e.to_string()));
            false
        }
    }
}

#[tauri::command]
async fn refresh_encryption_key(state: State<'_, AppState>) -> Result<String, String> {
    eprintln!("Refreshing encryption key from keyring...");

    let db_guard = state.db.lock().unwrap();
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    match db.reconnect_all() {
        Ok(_) => {
            state.set_connected(true);
            state.set_error(None);
            Ok("Encryption key refreshed successfully".to_string())
        }
        Err(e) => {
            state.set_connected(false);
            state.set_error(Some(e.to_string()));
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn start_p2p_sync(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    port: Option<u16>,
) -> Result<String, String> {
    let mut handle_guard = state.sync_handle.lock().await;
    if handle_guard.is_some() {
        return Err("P2P sync is already running".to_string());
    }

    let db = Database::new().map_err(|e| e.to_string())?;
    db.init().map_err(|e| e.to_string())?;
    *state.sync_db.lock().await = Some(db);

    let sync_db = Arc::new(TokioMutex::new(state.sync_db.lock().await.clone()));
    let listen_port = port.unwrap_or(0);

    let (sync_handle, peer_id) = sync::start_sync_engine(sync_db, app, listen_port).await?;

    *handle_guard = Some(sync_handle);

    Ok(format!("P2P sync started with peer ID: {peer_id}"))
}

#[tauri::command]
async fn stop_p2p_sync(state: State<'_, AppState>) -> Result<String, String> {
    let mut handle_guard = state.sync_handle.lock().await;
    let handle = handle_guard
        .take()
        .ok_or("P2P sync is not running")?;

    handle.stop().await?;
    *state.sync_db.lock().await = None;

    Ok("P2P sync stopped".to_string())
}

#[tauri::command]
async fn get_sync_status(state: State<'_, AppState>) -> Result<SyncStatus, String> {
    let handle_guard = state.sync_handle.lock().await;
    match handle_guard.as_ref() {
        Some(handle) => handle.get_status().await,
        None => Ok(SyncStatus {
            is_running: false,
            peer_id: String::new(),
            connected_peers: vec![],
            last_sync: None,
            sync_count: 0,
        }),
    }
}

#[tauri::command]
async fn request_full_sync(state: State<'_, AppState>) -> Result<String, String> {
    let handle_guard = state.sync_handle.lock().await;
    let handle = handle_guard
        .as_ref()
        .ok_or("P2P sync is not running")?;

    handle.request_full_sync().await?;
    Ok("Full sync request sent".to_string())
}

#[tauri::command]
async fn create_note(
    note: NoteCreate,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Note, String> {
    if !state.is_connected() {
        return Err("Database not connected. Please wait or try reconnecting.".to_string());
    }

    let result = with_retry(
        || {
            let db_guard = state.db.lock().unwrap();
            let db = db_guard.as_ref().ok_or("Database not initialized")?;
            db.create_note(note.clone()).map_err(|e| e.to_string())
        },
        3,
    );

    match result {
        Ok(created_note) => {
            if let Err(e) = broadcast_note_created(&state, &created_note).await {
                eprintln!("Failed to broadcast note creation: {e}");
            }
            Ok(created_note)
        }
        Err(e) => {
            if e.contains("Connection broken") || e.contains("Reconnection") || e.contains("LockPoisoned") {
                state.set_connected(false);
                state.set_error(Some(e.clone()));
                app.emit("connection-status", ConnectionStatus {
                    connected: false,
                    error: Some(e.clone()),
                }).ok();
            }
            Err(e)
        }
    }
}

async fn broadcast_note_created(state: &AppState, note: &Note) -> Result<(), String> {
    let handle_guard = state.sync_handle.lock().await;
    if let Some(handle) = handle_guard.as_ref() {
        let db_guard = state.db.lock().unwrap();
        let db = db_guard.as_ref().ok_or("Database not initialized")?;
        let encrypted = db.get_encrypted_note(&note.id)
            .map_err(|e| e.to_string())?
            .ok_or("Note not found after creation")?;

        handle.broadcast_note_created(encrypted).await?;
    }
    Ok(())
}

async fn broadcast_note_updated(state: &AppState, note: &Note) -> Result<(), String> {
    let handle_guard = state.sync_handle.lock().await;
    if let Some(handle) = handle_guard.as_ref() {
        let db_guard = state.db.lock().unwrap();
        let db = db_guard.as_ref().ok_or("Database not initialized")?;
        let encrypted = db.get_encrypted_note(&note.id)
            .map_err(|e| e.to_string())?
            .ok_or("Note not found after update")?;

        handle.broadcast_note_updated(encrypted).await?;
    }
    Ok(())
}

#[tauri::command]
async fn get_notes(state: State<'_, AppState>, app: tauri::AppHandle) -> Result<Vec<Note>, String> {
    if !state.is_connected() {
        return Err("Database not connected. Please wait or try reconnecting.".to_string());
    }

    let result = with_retry(
        || {
            let db_guard = state.db.lock().unwrap();
            let db = db_guard.as_ref().ok_or("Database not initialized")?;
            db.get_notes().map_err(|e| e.to_string())
        },
        3,
    );

    match result {
        Ok(notes) => Ok(notes),
        Err(e) => {
            if e.contains("Connection broken") || e.contains("Reconnection") || e.contains("LockPoisoned") {
                state.set_connected(false);
                state.set_error(Some(e.clone()));
                app.emit("connection-status", ConnectionStatus {
                    connected: false,
                    error: Some(e.clone()),
                }).ok();
            }
            Err(e)
        }
    }
}

#[tauri::command]
async fn get_note_by_id(
    id: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Option<Note>, String> {
    if !state.is_connected() {
        return Err("Database not connected. Please wait or try reconnecting.".to_string());
    }

    let result = with_retry(
        || {
            let db_guard = state.db.lock().unwrap();
            let db = db_guard.as_ref().ok_or("Database not initialized")?;
            db.get_note_by_id(&id).map_err(|e| e.to_string())
        },
        3,
    );

    match result {
        Ok(note) => Ok(note),
        Err(e) => {
            if e.contains("Connection broken") || e.contains("Reconnection") || e.contains("LockPoisoned") {
                state.set_connected(false);
                state.set_error(Some(e.clone()));
                app.emit("connection-status", ConnectionStatus {
                    connected: false,
                    error: Some(e.clone()),
                }).ok();
            }
            Err(e)
        }
    }
}

#[tauri::command]
async fn update_note(
    id: String,
    note: NoteUpdate,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Note, String> {
    if !state.is_connected() {
        return Err("Database not connected. Please wait or try reconnecting.".to_string());
    }

    let result = with_retry(
        || {
            let db_guard = state.db.lock().unwrap();
            let db = db_guard.as_ref().ok_or("Database not initialized")?;
            db.update_note(&id, note.clone()).map_err(|e| e.to_string())
        },
        3,
    );

    match result {
        Ok(updated_note) => {
            if let Err(e) = broadcast_note_updated(&state, &updated_note).await {
                eprintln!("Failed to broadcast note update: {e}");
            }
            Ok(updated_note)
        }
        Err(e) => {
            if e.contains("Connection broken") || e.contains("Reconnection") || e.contains("LockPoisoned") {
                state.set_connected(false);
                state.set_error(Some(e.clone()));
                app.emit("connection-status", ConnectionStatus {
                    connected: false,
                    error: Some(e.clone()),
                }).ok();
            }
            Err(e)
        }
    }
}

#[tauri::command]
async fn delete_note(
    id: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<bool, String> {
    if !state.is_connected() {
        return Err("Database not connected. Please wait or try reconnecting.".to_string());
    }

    let result = with_retry(
        || {
            let db_guard = state.db.lock().unwrap();
            let db = db_guard.as_ref().ok_or("Database not initialized")?;
            db.delete_note(&id).map_err(|e| e.to_string())
        },
        3,
    );

    match result {
        Ok(deleted) => {
            if deleted {
                let handle_guard = state.sync_handle.lock().await;
                if let Some(handle) = handle_guard.as_ref() {
                    let payload = sync::protocol::NoteDeletePayload {
                        id: id.clone(),
                        deleted_at: chrono::Utc::now().to_rfc3339(),
                    };
                    if let Err(e) = handle.broadcast_note_deleted(payload).await {
                        eprintln!("Failed to broadcast note deletion: {e}");
                    }
                }
            }
            Ok(deleted)
        }
        Err(e) => {
            if e.contains("Connection broken") || e.contains("Reconnection") || e.contains("LockPoisoned") {
                state.set_connected(false);
                state.set_error(Some(e.clone()));
                app.emit("connection-status", ConnectionStatus {
                    connected: false,
                    error: Some(e.clone()),
                }).ok();
            }
            Err(e)
        }
    }
}

#[tauri::command]
async fn search_notes(
    query: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Vec<Note>, String> {
    if !state.is_connected() {
        return Err("Database not connected. Please wait or try reconnecting.".to_string());
    }

    let result = with_retry(
        || {
            let db_guard = state.db.lock().unwrap();
            let db = db_guard.as_ref().ok_or("Database not initialized")?;
            db.search_notes(&query).map_err(|e| e.to_string())
        },
        3,
    );

    match result {
        Ok(notes) => Ok(notes),
        Err(e) => {
            if e.contains("Connection broken") || e.contains("Reconnection") || e.contains("LockPoisoned") {
                state.set_connected(false);
                state.set_error(Some(e.clone()));
                app.emit("connection-status", ConnectionStatus {
                    connected: false,
                    error: Some(e.clone()),
                }).ok();
            }
            Err(e)
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = Arc::new(AppState::new());
    let app_state_clone = app_state.clone();

    tauri::Builder::default()
        .manage(Arc::clone(&app_state))
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let state = app_state_clone.clone();

            std::thread::spawn(move || {
                let interval = std::time::Duration::from_secs(30);
                loop {
                    std::thread::sleep(interval);

                    if state.is_connected() {
                        match db_health_check(&state) {
                            Ok(true) => {
                                state.set_connected(true);
                                state.set_error(None);
                            }
                            _ => {
                                if let Err(e) = db_reconnect(&state) {
                                    state.set_connected(false);
                                    state.set_error(Some(e));
                                    let _ = app_handle.emit("connection-status", ConnectionStatus {
                                        connected: false,
                                        error: state.get_error(),
                                    });
                                } else {
                                    state.set_connected(true);
                                    state.set_error(None);
                                    let _ = app_handle.emit("connection-status", ConnectionStatus {
                                        connected: true,
                                        error: None,
                                    });
                                }
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            initialize_database,
            reconnect_database,
            get_connection_status,
            health_check,
            refresh_encryption_key,
            start_p2p_sync,
            stop_p2p_sync,
            get_sync_status,
            request_full_sync,
            create_note,
            get_notes,
            get_note_by_id,
            update_note,
            delete_note,
            search_notes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn db_health_check(state: &AppState) -> Result<bool, String> {
    let db_guard = state.db.lock().unwrap();
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    db.reconnect_all().map(|_| true).map_err(|e| e.to_string())
}

fn db_reconnect(state: &AppState) -> Result<(), String> {
    let db = Database::new().map_err(|e| e.to_string())?;
    db.init().map_err(|e| e.to_string())?;
    *state.db.lock().unwrap() = Some(db);
    Ok(())
}
