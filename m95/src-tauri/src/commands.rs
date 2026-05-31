use crate::docker::DockerClient;
use crate::docker::DockerCommandExecutor;
use crate::docker::models::*;
use crate::docker::transport::TransportKind;
use std::sync::Mutex;
use tauri::{AppHandle, State};

pub struct AppState {
    pub docker_client: DockerClient,
    pub memory_history: Mutex<Vec<MemoryHistoryPoint>>,
}

#[tauri::command]
pub async fn list_containers(state: State<'_, AppState>) -> Result<Vec<Container>, String> {
    state.docker_client.list_containers().await
}

#[tauri::command]
pub async fn get_container_stats(
    container_id: String,
    state: State<'_, AppState>,
) -> Result<ContainerStats, String> {
    state.docker_client.get_container_stats(&container_id).await
}

#[tauri::command]
pub async fn get_all_container_stats(
    state: State<'_, AppState>,
) -> Result<Vec<ContainerStats>, String> {
    let containers = state.docker_client.list_containers().await?;
    let mut all_stats = Vec::new();

    for container in &containers {
        if container.state == "running" {
            if let Ok(mut stats) = state.docker_client.get_container_stats(&container.id).await {
                stats.container_name = container
                    .names
                    .first()
                    .cloned()
                    .unwrap_or_else(|| container.id[..12].to_string());

                let mut history = state.memory_history.lock().unwrap();
                history.push(MemoryHistoryPoint {
                    timestamp: stats.timestamp,
                    memory_usage: stats.memory_usage,
                    container_id: stats.container_id.clone(),
                    container_name: stats.container_name.clone(),
                });

                all_stats.push(stats);
            }
        }
    }

    Ok(all_stats)
}

#[tauri::command]
pub async fn get_container_logs(
    container_id: String,
    tail: u32,
    state: State<'_, AppState>,
) -> Result<Vec<LogEntry>, String> {
    state.docker_client.get_container_logs(&container_id, tail).await
}

#[tauri::command]
pub async fn get_topology(state: State<'_, AppState>) -> Result<TopologyData, String> {
    state.docker_client.get_topology().await
}

#[tauri::command]
pub fn get_memory_history(state: State<'_, AppState>) -> Result<Vec<MemoryHistoryPoint>, String> {
    let history = state.memory_history.lock().unwrap();
    Ok(history.clone())
}

#[tauri::command]
pub fn clear_memory_history(state: State<'_, AppState>) -> Result<(), String> {
    let mut history = state.memory_history.lock().unwrap();
    history.clear();
    Ok(())
}

#[tauri::command]
pub fn get_transport_info(state: State<'_, AppState>) -> Result<String, String> {
    match state.docker_client.get_transport_kind() {
        TransportKind::NamedPipe => Ok("named_pipe".to_string()),
        TransportKind::Tcp => Ok("tcp".to_string()),
    }
}

#[tauri::command]
pub async fn get_image_layers(
    image_name: String,
    state: State<'_, AppState>,
) -> Result<Vec<ImageLayer>, String> {
    state.docker_client.get_image_layers(&image_name).await
}

#[tauri::command]
pub async fn execute_docker_command(
    docker_command: String,
    container_id: String,
    container_name: String,
    app_handle: AppHandle,
) -> Result<(), String> {
    DockerCommandExecutor::execute(app_handle, &docker_command, &container_id, &container_name).await
}
