use crate::AppState;
use std::sync::Arc;
use tauri::{Emitter, AppHandle};
use tokio::sync::mpsc;

#[cfg(target_os = "linux")]
pub mod linux {
    use super::*;
    use std::sync::atomic::Ordering;
    use zbus::zvariant::OwnedValue;

    #[derive(Debug, serde::Serialize, Clone)]
    pub struct PowerEvent {
        pub event_type: String,
        pub timestamp: String,
    }

    pub async fn monitor_power_events(
        app: AppHandle,
        state: Arc<AppState>,
        mut shutdown_rx: mpsc::Receiver<()>,
    ) {
        eprintln!("Starting Linux power event monitor...");

        loop {
            tokio::select! {
                _ = shutdown_rx.recv() => {
                    eprintln!("Power event monitor shutting down...");
                    return;
                }
                result = monitor_logind_events(app.clone(), state.clone()) => {
                    match result {
                        Ok(_) => eprintln!("Power event monitor exited normally"),
                        Err(e) => {
                            eprintln!("Power event monitor error: {e}, restarting in 5 seconds...");
                            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                        }
                    }
                }
            }
        }
    }

    async fn monitor_logind_events(
        app: AppHandle,
        state: Arc<AppState>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = zbus::Connection::system().await?;

        let proxy = conn
            .proxy(
                "org.freedesktop.login1",
                "/org/freedesktop/login1",
                "org.freedesktop.login1.Manager",
            )
            .await?;

        eprintln!("Connected to logind, monitoring for sleep/resume events");

        let mut prepare_for_sleep = proxy
            .receive_signal("PrepareForSleep")
            .await?;

        loop {
            tokio::select! {
                Some(msg) = prepare_for_sleep.next() => {
                    let body = msg.body::<(bool,)>();
                    match body {
                        Ok((starting,)) => {
                            if starting {
                                eprintln!("System is preparing for sleep...");
                                state.set_connected(false);
                                let _ = app.emit("power-event", PowerEvent {
                                    event_type: "suspend".to_string(),
                                    timestamp: chrono::Utc::now().to_rfc3339(),
                                });
                            } else {
                                eprintln!("System is resuming from sleep...");
                                let _ = app.emit("power-event", PowerEvent {
                                    event_type: "resume".to_string(),
                                    timestamp: chrono::Utc::now().to_rfc3339(),
                                });

                                let app_clone = app.clone();
                                let state_clone = state.clone();
                                tokio::spawn(async move {
                                    handle_wakeup(app_clone, state_clone).await;
                                });
                            }
                        }
                        Err(e) => {
                            eprintln!("Failed to parse PrepareForSleep signal: {e}");
                        }
                    }
                }
                else => {
                    eprintln!("Signal stream ended, reconnecting...");
                    return Ok(());
                }
            }
        }
    }

    async fn handle_wakeup(app: AppHandle, state: Arc<AppState>) {
        eprintln!("Handling system wakeup, initiating recovery...");

        let _ = app.emit("connection-status", super::ConnectionStatus {
            connected: false,
            error: Some("系统已唤醒，正在恢复连接...".to_string()),
        });

        for attempt in 1..=5 {
            eprintln!("Wakeup recovery attempt {attempt}/5");

            match crate::db_reconnect(&state) {
                Ok(_) => {
                    state.set_connected(true);
                    state.set_error(None);
                    let _ = app.emit("connection-status", super::ConnectionStatus {
                        connected: true,
                        error: None,
                    });
                    let _ = app.emit("wakeup-recovery", "success");
                    eprintln!("Wakeup recovery completed successfully on attempt {attempt}");
                    return;
                }
                Err(e) => {
                    eprintln!("Wakeup recovery attempt {attempt} failed: {e}");
                    state.set_error(Some(e.clone()));
                    let _ = app.emit("connection-status", super::ConnectionStatus {
                        connected: false,
                        error: Some(format!("恢复连接失败（第 {attempt}/5 次）: {e}")),
                    });

                    if attempt < 5 {
                        tokio::time::sleep(tokio::time::Duration::from_secs(2 * attempt as u64)).await;
                    }
                }
            }
        }

        state.set_connected(false);
        let _ = app.emit("connection-status", super::ConnectionStatus {
            connected: false,
            error: Some("系统唤醒后无法恢复数据库连接，请手动重连".to_string()),
        });
        let _ = app.emit("wakeup-recovery", "failed");
        eprintln!("Wakeup recovery failed after all attempts");
    }
}

#[cfg(not(target_os = "linux"))]
pub mod linux {
    use super::*;

    pub async fn monitor_power_events(
        _app: AppHandle,
        _state: Arc<AppState>,
        mut _shutdown_rx: mpsc::Receiver<()>,
    ) {
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ConnectionStatus {
    pub connected: bool,
    pub error: Option<String>,
}

pub fn db_reconnect(state: &AppState) -> Result<(), String> {
    let db = crate::database::Database::new().map_err(|e| e.to_string())?;
    db.init().map_err(|e| e.to_string())?;
    *state.db.lock().unwrap() = Some(db);
    Ok(())
}
