pub mod cli;
pub mod commands;
pub mod config;
pub mod env;
pub mod hotkey;
pub mod logger;
pub mod script;
pub mod tray;
pub mod workflow;

use std::sync::Arc;
use parking_lot::Mutex;

pub type AppState = Arc<Mutex<AppStateInner>>;

#[derive(Clone)]
pub struct AppStateInner {
    pub config_manager: config::ConfigManager,
    pub script_engine: script::ScriptEngine,
    pub logger: logger::LogCollector,
    pub hotkey_manager: hotkey::HotkeyManager,
}

impl AppStateInner {
    pub fn new() -> Self {
        let config_manager = config::ConfigManager::new();
        let logger = logger::LogCollector::new(config_manager.get_log_dir());
        let script_engine = script::ScriptEngine::new(logger.clone());
        let hotkey_manager = hotkey::HotkeyManager::new();

        Self {
            config_manager,
            script_engine,
            logger,
            hotkey_manager,
        }
    }
}

impl Default for AppStateInner {
    fn default() -> Self {
        Self::new()
    }
}

pub fn create_app_state() -> AppState {
    Arc::new(Mutex::new(AppStateInner::new()))
}

pub fn run() {
    let state = create_app_state();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(state.clone())
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::get_tasks,
            commands::add_task,
            commands::update_task,
            commands::delete_task,
            commands::run_task,
            commands::stop_task,
            commands::register_hotkey,
            commands::unregister_hotkey,
            commands::get_logs,
            commands::clear_logs,
            commands::show_main_window,
            commands::hide_main_window,
            commands::get_workflows,
            commands::add_workflow,
            commands::update_workflow,
            commands::delete_workflow,
            commands::run_workflow,
            commands::export_workflow,
            commands::export_workflow_content,
        ])
        .setup(move |app| {
            tray::setup_tray(app, state.clone())?;
            
            let app_handle = app.handle().clone();
            let state_clone = state.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = hotkey::start_hotkey_listener(&state_clone, &app_handle).await {
                    tracing::error!("Failed to start hotkey listener: {}", e);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
