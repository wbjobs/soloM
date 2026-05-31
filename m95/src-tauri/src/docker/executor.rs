use crate::docker::models::CommandOutput;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

pub struct DockerCommandExecutor;

impl DockerCommandExecutor {
    pub async fn execute(
        app_handle: tauri::AppHandle,
        docker_command: &str,
        container_id: &str,
        container_name: &str,
    ) -> Result<(), String> {
        let valid_commands = ["stop", "start", "restart", "pause", "unpause", "rm"];
        if !valid_commands.contains(&docker_command) {
            return Err(format!("Unsupported command: {}. Allowed: {:?}", docker_command, valid_commands));
        }

        let short_id = if container_id.len() > 12 {
            &container_id[..12]
        } else {
            container_id
        };

        let event_name = format!("docker-cmd-{}", container_id);

        let _ = app_handle.emit_all(
            &event_name,
            CommandOutput {
                line: format!("> docker {} {}", docker_command, short_id),
                stream_type: "system".to_string(),
                is_error: false,
            },
        );

        let mut child = Command::new("docker")
            .arg(docker_command)
            .arg(container_id)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to execute docker {}: {}", docker_command, e))?;

        let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

        let handle = app_handle.clone();
        let event_name_clone = event_name.clone();
        let stdout_reader = tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = handle.emit_all(
                    &event_name_clone,
                    CommandOutput {
                        line,
                        stream_type: "stdout".to_string(),
                        is_error: false,
                    },
                );
            }
        });

        let handle = app_handle.clone();
        let event_name_clone = event_name.clone();
        let stderr_reader = tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = handle.emit_all(
                    &event_name_clone,
                    CommandOutput {
                        line,
                        stream_type: "stderr".to_string(),
                        is_error: true,
                    },
                );
            }
        });

        let status = child.wait().await.map_err(|e| format!("Wait error: {}", e))?;

        let _ = stdout_reader.await;
        let _ = stderr_reader.await;

        let exit_msg = if status.success() {
            format!("✓ docker {} {} completed successfully", docker_command, short_id)
        } else {
            format!(
                "✗ docker {} {} failed with exit code {}",
                docker_command,
                short_id,
                status.code().unwrap_or(-1)
            )
        };

        let _ = app_handle.emit_all(
            &event_name,
            CommandOutput {
                line: exit_msg,
                stream_type: "system".to_string(),
                is_error: !status.success(),
            },
        );

        Ok(())
    }
}
