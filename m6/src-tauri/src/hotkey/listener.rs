use super::manager::parse_hotkey;
use crate::{AppState, AppStateInner};
use anyhow::Result;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use parking_lot::Mutex;

pub async fn start_hotkey_listener(state: &AppState, app_handle: &AppHandle) -> Result<()> {
    let state_clone = state.clone();
    let app_handle_clone = app_handle.clone();
    
    let hotkey_state = state_clone.clone();
    
    let tasks = {
        let state_guard = state_clone.lock();
        state_guard.config_manager.get_tasks()?
    };

    for task in tasks.iter().filter(|t| t.enabled) {
        if let Err(e) = register_hotkey_task(&hotkey_state, &app_handle_clone.clone(), &task.hotkey, &task.name).await {
            tracing::warn!("Failed to register hotkey '{}': {}", task.hotkey, e);
        }
    }

    setup_app_focus_listener(state, app_handle).await;

    #[cfg(target_os = "macos")]
    {
        setup_macos_keepalive(app_handle);
    }

    Ok(())
}

async fn setup_app_focus_listener(state: &AppState, app_handle: &AppHandle) {
    let state_clone = state.clone();
    let app_handle_clone = app_handle.clone();

    app_handle.listen_global("tauri://focus", move |_| {
        let state = state_clone.clone();
        let app_handle = app_handle_clone.clone();
        tauri::async_runtime::spawn(async move {
            tracing::info!("App gained focus, re-registering hotkeys");
            if let Err(e) = reregister_all_hotkeys(&state, &app_handle).await {
                tracing::error!("Failed to re-register hotkeys: {}", e);
            }
        });
    });

    let state_clone = state.clone();
    let app_handle_clone = app_handle.clone();
    
    app_handle.listen_global("tauri://show", move |_| {
        let state = state_clone.clone();
        let app_handle = app_handle_clone.clone();
        tauri::async_runtime::spawn(async move {
            tracing::info!("App window shown, re-registering hotkeys");
            if let Err(e) = reregister_all_hotkeys(&state, &app_handle).await {
                tracing::error!("Failed to re-register hotkeys: {}", e);
            }
        });
    });
}

#[cfg(target_os = "macos")]
fn setup_macos_keepalive(app_handle: &AppHandle) {
    let app_handle = app_handle.clone();
    
    std::thread::spawn(move || {
        let mut last_check = std::time::Instant::now();
        let check_interval = std::time::Duration::from_secs(30);
        
        loop {
            std::thread::sleep(check_interval);
            
            if last_check.elapsed() >= check_interval {
                last_check = std::time::Instant::now();
                
                let app_handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    tracing::debug!("Periodic hotkey health check (macOS keepalive)");
                });
            }
        }
    });
}

pub async fn reregister_all_hotkeys(state: &AppState, app_handle: &AppHandle) -> Result<()> {
    let tasks = {
        let state_guard = state.lock();
        state_guard.config_manager.get_tasks()?
    };

    let shortcut_manager = app_handle.global_shortcut();
    
    for task in tasks.iter().filter(|t| t.enabled) {
        let (modifiers, key) = match parse_hotkey(&task.hotkey) {
            Ok(parsed) => parsed,
            Err(e) => {
                tracing::warn!("Invalid hotkey format '{}': {}", task.hotkey, e);
                continue;
            }
        };
        
        let hotkey_str = format!("{}+{}", modifiers.join("+"), key);
        
        let is_registered = {
            let state_guard = state.lock();
            state_guard.hotkey_manager.is_registered(&task.hotkey)
        };
        
        if is_registered {
            if let Err(e) = shortcut_manager.unregister(&hotkey_str) {
                tracing::debug!("Unregister hotkey '{}' failed (may not be registered): {}", hotkey_str, e);
            }
        }
        
        if let Err(e) = register_hotkey_task(state, app_handle, &task.hotkey, &task.name).await {
            tracing::warn!("Failed to re-register hotkey '{}': {}", task.hotkey, e);
        }
    }

    tracing::info!("All hotkeys re-registered successfully");
    Ok(())
}

async fn register_hotkey_task(
    state: &AppState,
    app_handle: &AppHandle,
    hotkey: &str,
    task_name: &str,
) -> Result<()> {
    let (modifiers, key) = parse_hotkey(hotkey)?;
    
    let hotkey_str = format!("{}+{}", modifiers.join("+"), key);
    
    let state_clone = state.clone();
    let app_handle_clone = app_handle.clone();
    let task_name_clone = task_name.to_string();
    let hotkey_clone = hotkey.to_string();
    
    let shortcut_manager = app_handle.global_shortcut();
    
    shortcut_manager.on_shortcut(hotkey_str.clone(), move || {
        let state = state_clone.clone();
        let app_handle = app_handle_clone.clone();
        let task_name = task_name_clone.clone();
        let hotkey = hotkey_clone.clone();
        
        tauri::async_runtime::spawn(async move {
            tracing::info!("Hotkey '{}' pressed for task '{}'", hotkey, task_name);
            
            let _ = app_handle.emit("hotkey-pressed", serde_json::json!({
                "hotkey": hotkey,
                "task_name": task_name
            }));
            
            let task_opt = {
                let state_guard = state.lock();
                state_guard.config_manager.get_task_by_hotkey(&hotkey).ok().flatten()
            };
            
            if let Some(task) = task_opt {
                let script_engine = {
                    let state_guard = state.lock();
                    state_guard.script_engine.clone()
                };
                
                let state_for_engine = state.clone();
                let app_handle_for_engine = app_handle.clone();
                let task_for_engine = task.clone();
                
                tokio::spawn(async move {
                    match script_engine.execute(&task_for_engine).await {
                        Ok(execution_state) => {
                            let _ = app_handle_for_engine.emit(
                                "execution-state-changed",
                                serde_json::to_value(&execution_state).unwrap_or_default()
                            );
                            
                            let state_guard = state_for_engine.lock();
                            for log in state_guard.logger.get_logs(Some(&task_for_engine.name), Some(100)) {
                                let _ = app_handle_for_engine.emit(
                                    "log-entry",
                                    serde_json::to_value(&log).unwrap_or_default()
                                );
                            }
                        }
                        Err(e) => {
                            tracing::error!("Failed to execute task '{}': {}", task_for_engine.name, e);
                        }
                    }
                });
            }
        });
    })?;

    {
        let state_guard = state.lock();
        state_guard.hotkey_manager.register(hotkey, task_name)?;
    }

    Ok(())
}

pub async fn register_hotkey(
    state: &AppState,
    app_handle: &AppHandle,
    hotkey: &str,
    task_name: &str,
) -> Result<()> {
    let state_guard = state.lock();
    if state_guard.hotkey_manager.is_registered(hotkey) {
        return Err(anyhow::anyhow!("Hotkey '{}' is already registered", hotkey));
    }
    drop(state_guard);
    
    register_hotkey_task(state, app_handle, hotkey, task_name).await
}

pub async fn unregister_hotkey(
    state: &AppState,
    app_handle: &AppHandle,
    hotkey: &str,
) -> Result<()> {
    let (modifiers, key) = parse_hotkey(hotkey)?;
    let hotkey_str = format!("{}+{}", modifiers.join("+"), key);
    
    let shortcut_manager = app_handle.global_shortcut();
    shortcut_manager.unregister(&hotkey_str)?;
    
    let state_guard = state.lock();
    state_guard.hotkey_manager.unregister(hotkey)?;
    
    Ok(())
}
