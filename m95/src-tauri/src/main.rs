#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod docker;
mod commands;

use commands::*;
use docker::DockerClient;
use std::sync::Mutex;

struct AppState {
    docker_client: DockerClient,
    memory_history: Mutex<Vec<docker::models::MemoryHistoryPoint>>,
}

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            docker_client: DockerClient::new(),
            memory_history: Mutex::new(Vec::new()),
        })
        .invoke_handler(tauri::generate_handler![
            list_containers,
            get_container_stats,
            get_all_container_stats,
            get_container_logs,
            get_topology,
            get_memory_history,
            clear_memory_history,
            get_transport_info,
            get_image_layers,
            execute_docker_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
