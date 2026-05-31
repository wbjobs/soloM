use crate::{AppState, AppStateInner};
use crate::config::models::{AppConfig, Task};
use crate::hotkey::{register_hotkey as register_hotkey_impl, unregister_hotkey as unregister_hotkey_impl};
use crate::logger::LogEntry;
use crate::script::ExecutionState;
use crate::workflow::{Workflow, WorkflowExecutionState, ExportFormat, WorkflowExporter, WorkflowEngine};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn get_config(state: State<'_, AppState>) -> Result<AppConfig, String> {
    let state_guard = state.lock();
    state_guard.config_manager.load_config().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_config(state: State<'_, AppState>, config: AppConfig) -> Result<(), String> {
    let state_guard = state.lock();
    state_guard.config_manager.save_config(&config).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_tasks(state: State<'_, AppState>) -> Result<Vec<Task>, String> {
    let state_guard = state.lock();
    state_guard.config_manager.get_tasks().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_task(state: State<'_, AppState>, task: Task) -> Result<(), String> {
    let state_guard = state.lock();
    state_guard.config_manager.add_task(task).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_task(state: State<'_, AppState>, task: Task) -> Result<(), String> {
    let state_guard = state.lock();
    state_guard.config_manager.update_task(task).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_task(state: State<'_, AppState>, name: String) -> Result<(), String> {
    let state_guard = state.lock();
    state_guard.config_manager.delete_task(&name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn run_task(state: State<'_, AppState>, name: String) -> Result<ExecutionState, String> {
    let task_opt = {
        let state_guard = state.lock();
        state_guard.config_manager.load_config()
            .map_err(|e| e.to_string())?
            .tasks
            .into_iter()
            .find(|t| t.name == name)
    };

    let task = task_opt.ok_or_else(|| format!("Task '{}' not found", name))?;

    let script_engine = {
        let state_guard = state.lock();
        state_guard.script_engine.clone()
    };

    script_engine.execute(&task).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_task(state: State<'_, AppState>, name: String) -> Result<(), String> {
    let state_guard = state.lock();
    state_guard.script_engine.stop_task(&name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn register_hotkey(
    app: AppHandle,
    state: State<'_, AppState>,
    hotkey: String,
    task_name: String,
) -> Result<(), String> {
    register_hotkey_impl(&state, &app, &hotkey, &task_name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn unregister_hotkey(
    app: AppHandle,
    state: State<'_, AppState>,
    hotkey: String,
) -> Result<(), String> {
    unregister_hotkey_impl(&state, &app, &hotkey)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_logs(
    state: State<'_, AppState>,
    task_name: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<LogEntry>, String> {
    let state_guard = state.lock();
    Ok(state_guard.logger.get_logs(task_name.as_deref(), limit))
}

#[tauri::command]
pub async fn clear_logs(state: State<'_, AppState>) -> Result<(), String> {
    let state_guard = state.lock();
    state_guard.logger.clear();
    Ok(())
}

#[tauri::command]
pub async fn show_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn hide_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_workflows(state: State<'_, AppState>) -> Result<Vec<Workflow>, String> {
    let state_guard = state.lock();
    state_guard.config_manager.get_workflows().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_workflow(state: State<'_, AppState>, workflow: Workflow) -> Result<(), String> {
    let state_guard = state.lock();
    state_guard.config_manager.add_workflow(workflow).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_workflow(state: State<'_, AppState>, workflow: Workflow) -> Result<(), String> {
    let state_guard = state.lock();
    state_guard.config_manager.update_workflow(workflow).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_workflow(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let state_guard = state.lock();
    state_guard.config_manager.delete_workflow(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn run_workflow(state: State<'_, AppState>, id: String) -> Result<WorkflowExecutionState, String> {
    let workflow_opt = {
        let state_guard = state.lock();
        state_guard.config_manager.get_workflow_by_id(&id).map_err(|e| e.to_string())?
    };

    let workflow = workflow_opt.ok_or_else(|| format!("Workflow '{}' not found", id))?;

    let logger = {
        let state_guard = state.lock();
        state_guard.logger.clone()
    };

    let engine = WorkflowEngine::new(logger);
    engine.execute(&workflow).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_workflow(state: State<'_, AppState>, id: String, format: String) -> Result<String, String> {
    let workflow_opt = {
        let state_guard = state.lock();
        state_guard.config_manager.get_workflow_by_id(&id).map_err(|e| e.to_string())?
    };

    let workflow = workflow_opt.ok_or_else(|| format!("Workflow '{}' not found", id))?;

    let export_format = match format.as_str() {
        "shell" => ExportFormat::Shell,
        "python" => ExportFormat::Python,
        "cli" => ExportFormat::Cli,
        _ => return Err(format!("Invalid export format: {}", format)),
    };

    WorkflowExporter::export(&workflow, export_format).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_workflow_content(workflow: Workflow, format: String) -> Result<String, String> {
    let export_format = match format.as_str() {
        "shell" => ExportFormat::Shell,
        "python" => ExportFormat::Python,
        "cli" => ExportFormat::Cli,
        _ => return Err(format!("Invalid export format: {}", format)),
    };

    WorkflowExporter::export(&workflow, export_format).map_err(|e| e.to_string())
}
