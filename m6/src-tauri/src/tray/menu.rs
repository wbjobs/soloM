use crate::{AppState, AppStateInner};
use anyhow::Result;
use std::sync::Arc;
use tauri::{AppHandle, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem, CustomMenuItem, Wry};
use parking_lot::Mutex;

pub fn setup_tray(app: &tauri::App<Wry>, state: AppState) -> Result<()> {
    let tray_menu = build_tray_menu(&state)?;
    
    let tray = SystemTray::new().with_menu(tray_menu);
    
    let state_clone = state.clone();
    
    tray.on_menu_event(move |app, event| {
        if let SystemTrayEvent::MenuItemClick { id, .. } = event {
            handle_menu_event(app, &state_clone.clone(), id.as_str());
        }
    })
    .build(app)?;

    Ok(())
}

fn build_tray_menu(state: &AppState) -> Result<SystemTrayMenu> {
    let state_guard = state.lock();
    let tasks = state_guard.config_manager.get_tasks()?;
    drop(state_guard);

    let mut tray_menu = SystemTrayMenu::new();
    
    tray_menu = tray_menu.add_item(CustomMenuItem::new("show_window", "显示主界面"));
    
    if tasks.is_empty() {
        tray_menu = tray_menu.add_native_item(SystemTrayMenuItem::Separator);
        tray_menu = tray_menu.add_item(CustomMenuItem::new("no_tasks", "暂无任务配置").disabled());
    } else {
        tray_menu = tray_menu.add_native_item(SystemTrayMenuItem::Separator);
        for task in tasks.iter().filter(|t| t.enabled) {
            let item = CustomMenuItem::new(format!("run:{}", task.name), &task.name);
            tray_menu = tray_menu.add_item(item);
        }
    }
    
    tray_menu = tray_menu.add_native_item(SystemTrayMenuItem::Separator);
    tray_menu = tray_menu.add_item(CustomMenuItem::new("view_logs", "查看日志"));
    tray_menu = tray_menu.add_item(CustomMenuItem::new("quit", "退出"));
    
    Ok(tray_menu)
}

fn handle_menu_event(app: &AppHandle, state: &AppState, id: &str) {
    match id {
        "show_window" => {
            if let Some(window) = app.get_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "view_logs" => {
            if let Some(window) = app.get_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "quit" => {
            app.exit(0);
        }
        id if id.starts_with("run:") => {
            let task_name = id.strip_prefix("run:").unwrap();
            
            let state_clone = state.clone();
            let app_handle = app.clone();
            let task_name = task_name.to_string();
            
            tauri::async_runtime::spawn(async move {
                let task_opt = {
                    let state_guard = state_clone.lock();
                    state_guard.config_manager.load_config()
                        .ok()
                        .and_then(|c| c.tasks.into_iter().find(|t| t.name == task_name))
                };
                
                if let Some(task) = task_opt {
                    let script_engine = {
                        let state_guard = state_clone.lock();
                        state_guard.script_engine.clone()
                    };
                    
                    match script_engine.execute(&task).await {
                        Ok(state) => {
                            let _ = app_handle.emit(
                                "execution-state-changed",
                                serde_json::to_value(&state).unwrap_or_default()
                            );
                        }
                        Err(e) => {
                            tracing::error!("Failed to execute task from tray: {}", e);
                        }
                    }
                }
            });
        }
        _ => {}
    }
}

pub fn refresh_tray_menu(app: &AppHandle, state: &AppState) -> Result<()> {
    if let Ok(new_menu) = build_tray_menu(state) {
        if let Some(tray) = app.tray_by_id("main") {
            tray.set_menu(Some(new_menu))?;
        }
    }
    Ok(())
}
