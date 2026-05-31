use super::super::config::models::{ScriptType, Task};
use super::super::env::EnvLoader;
use super::super::logger::LogCollector;
use anyhow::{Context, Result};
use chrono::Utc;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::oneshot;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExecutionState {
    pub task_name: String,
    pub status: ExecutionStatus,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub output: String,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExecutionStatus {
    Idle,
    Running,
    Success,
    Failed,
}

pub type TaskHandles = Arc<Mutex<HashMap<String, oneshot::Sender<()>>>>;

#[derive(Clone)]
pub struct ScriptEngine {
    logger: LogCollector,
    running_tasks: TaskHandles,
    env_loader: Option<EnvLoader>,
    auto_load_env: bool,
}

impl ScriptEngine {
    pub fn new(logger: LogCollector) -> Self {
        Self {
            logger,
            running_tasks: Arc::new(Mutex::new(HashMap::new())),
            env_loader: None,
            auto_load_env: true,
        }
    }

    pub fn with_env_loader(mut self, env_loader: EnvLoader) -> Self {
        self.env_loader = Some(env_loader);
        self
    }

    pub fn set_auto_load_env(&mut self, enabled: bool) {
        self.auto_load_env = enabled;
    }

    pub async fn execute(&self, task: &Task) -> Result<ExecutionState> {
        let mut state = ExecutionState {
            task_name: task.name.clone(),
            status: ExecutionStatus::Running,
            started_at: Some(Utc::now().to_rfc3339()),
            finished_at: None,
            output: String::new(),
            exit_code: None,
        };

        self.logger.info(&task.name, &format!("Starting task: {}", task.description));

        let (tx, rx) = oneshot::channel::<()>();
        self.running_tasks.lock().insert(task.name.clone(), tx);

        let result = self.execute_script(task, &mut state, rx).await;

        self.running_tasks.lock().remove(&task.name);

        state.finished_at = Some(Utc::now().to_rfc3339());

        match result {
            Ok(exit_code) => {
                state.exit_code = Some(exit_code);
                if exit_code == 0 {
                    state.status = ExecutionStatus::Success;
                    self.logger.success(&task.name, "Task completed successfully", exit_code);
                } else {
                    state.status = ExecutionStatus::Failed;
                    self.logger.failed(&task.name, &format!("Task failed with exit code {}", exit_code), exit_code);
                }
            }
            Err(e) => {
                state.status = ExecutionStatus::Failed;
                self.logger.error(&task.name, &format!("Task execution failed: {}", e));
            }
        }

        Ok(state)
    }

    async fn execute_script(
        &self,
        task: &Task,
        state: &mut ExecutionState,
        mut cancel_rx: oneshot::Receiver<()>,
    ) -> Result<i32> {
        let script_content = self.get_script_content(task)
            .with_context(|| "Failed to get script content")?;

        let mut cmd = self.build_command(task, &script_content)?;

        cmd.current_dir(&task.working_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if self.auto_load_env {
            self.load_user_env(&mut cmd).await;
        }

        if let Some(env_loader) = &self.env_loader {
            env_loader.apply_to_command(&mut cmd, false);
        }

        if let Some(env) = &task.env {
            for (k, v) in env {
                cmd.env(k, v);
            }
        }

        let mut child = cmd.spawn()
            .with_context(|| "Failed to spawn script process")?;

        let stdout = child.stdout.take().expect("Failed to capture stdout");
        let stderr = child.stderr.take().expect("Failed to capture stderr");

        let mut stdout_reader = BufReader::new(stdout).lines();
        let mut stderr_reader = BufReader::new(stderr).lines();

        let logger = self.logger.clone();
        let task_name = task.name.clone();
        let output = state.output.clone();
        let output_arc = Arc::new(Mutex::new(output));

        let output_clone = output_arc.clone();
        let logger_clone = logger.clone();
        let task_name_clone = task_name.clone();
        
        let stdout_handle = tokio::spawn(async move {
            while let Ok(Some(line)) = stdout_reader.next_line().await {
                let mut output = output_clone.lock();
                output.push_str(&line);
                output.push('\n');
                logger_clone.info(&task_name_clone, &line);
            }
        });

        let output_clone = output_arc.clone();
        let logger_clone = logger.clone();
        let task_name_clone = task_name.clone();
        
        let stderr_handle = tokio::spawn(async move {
            while let Ok(Some(line)) = stderr_reader.next_line().await {
                let mut output = output_clone.lock();
                output.push_str(&line);
                output.push('\n');
                logger_clone.error(&task_name_clone, &line);
            }
        });

        let wait_handle = tokio::spawn(async move {
            child.wait().await
        });

        let exit_code = tokio::select! {
            _ = &mut cancel_rx => {
                self.logger.warn(&task_name, "Task cancelled by user");
                if let Ok(Some(child)) = wait_handle.await.ok() {
                    if let Ok(child) = child {
                        child.kill().await.ok();
                    }
                }
                -1
            }
            result = wait_handle => {
                let _ = stdout_handle.await;
                let _ = stderr_handle.await;
                
                match result {
                    Ok(Ok(status)) => status.code().unwrap_or(-1),
                    _ => -1,
                }
            }
        };

        state.output = output_arc.lock().clone();

        Ok(exit_code)
    }

    fn get_script_content(&self, task: &Task) -> Result<String> {
        if let Some(content) = &task.script_content {
            if !content.is_empty() {
                return Ok(content.clone());
            }
        }

        if !task.script_path.is_empty() {
            let path = PathBuf::from(&task.script_path);
            if path.exists() {
                return std::fs::read_to_string(&path)
                    .with_context(|| format!("Failed to read script file: {:?}", path));
            }
        }

        Err(anyhow::anyhow!("No script content or valid script path provided"))
    }

    fn build_command(&self, task: &Task, script_content: &str) -> Result<Command> {
        let temp_file = self.create_temp_script(task, script_content)?;
        
        let mut cmd = match task.script_type {
            ScriptType::Shell => {
                if cfg!(windows) {
                    let mut cmd = Command::new("powershell");
                    cmd.arg("-ExecutionPolicy").arg("Bypass");
                    cmd.arg("-File").arg(&temp_file);
                    cmd
                } else {
                    let mut cmd = Command::new("sh");
                    cmd.arg(&temp_file);
                    cmd
                }
            }
            ScriptType::Python => {
                let mut cmd = Command::new("python3");
                cmd.arg(&temp_file);
                cmd
            }
        };

        Ok(cmd)
    }

    fn create_temp_script(&self, task: &Task, content: &str) -> Result<PathBuf> {
        let ext = match task.script_type {
            ScriptType::Shell => if cfg!(windows) { "ps1" } else { "sh" },
            ScriptType::Python => "py",
        };

        let temp_dir = std::env::temp_dir();
        let file_name = format!("hotkey_runner_{}.{}", Uuid::new_v4(), ext);
        let file_path = temp_dir.join(file_name);

        std::fs::write(&file_path, content)
            .with_context(|| format!("Failed to create temp script file: {:?}", file_path))?;

        Ok(file_path)
    }

    pub fn stop_task(&self, task_name: &str) -> Result<()> {
        if let Some(tx) = self.running_tasks.lock().remove(task_name) {
            let _ = tx.send(());
            Ok(())
        } else {
            Err(anyhow::anyhow!("Task '{}' is not running", task_name))
        }
    }

    pub fn is_running(&self, task_name: &str) -> bool {
        self.running_tasks.lock().contains_key(task_name)
    }

    async fn load_user_env(&self, cmd: &mut Command) {
        use crate::env::{is_running_in_cron, get_detected_shell, get_shell_config_files};
        
        let should_load = is_running_in_cron() || self.auto_load_env;
        
        if !should_load {
            return;
        }

        if let Some(shell) = get_detected_shell() {
            let config_files = get_shell_config_files(&shell);
            let mut env_loader = EnvLoader::with_custom_config_files(config_files);
            
            match env_loader.load_user_environment().await {
                Ok(env) => {
                    tracing::debug!("Loaded {} environment variables from user shell config", env.len());
                    
                    if let Some(path) = env.get("PATH") {
                        cmd.env("PATH", path);
                    }
                    
                    for (key, value) in env {
                        if key != "PATH" && std::env::var(&key).is_err() {
                            cmd.env(&key, value);
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed to load user environment: {}", e);
                }
            }
        }
    }
}
