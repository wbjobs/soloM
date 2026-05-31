use chrono::{DateTime, Utc};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LogEntry {
    pub id: String,
    pub task_name: String,
    pub timestamp: String,
    pub level: LogLevel,
    pub message: String,
    #[serde(default)]
    pub exit_code: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Info,
    Warn,
    Error,
    Success,
}

impl std::fmt::Display for LogLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LogLevel::Info => write!(f, "INFO"),
            LogLevel::Warn => write!(f, "WARN"),
            LogLevel::Error => write!(f, "ERROR"),
            LogLevel::Success => write!(f, "SUCCESS"),
        }
    }
}

#[derive(Clone)]
pub struct LogCollector {
    logs: Arc<Mutex<Vec<LogEntry>>>,
    log_dir: PathBuf,
    max_logs: usize,
}

impl LogCollector {
    pub fn new(log_dir: PathBuf) -> Self {
        fs::create_dir_all(&log_dir).ok();
        
        Self {
            logs: Arc::new(Mutex::new(Vec::new())),
            log_dir,
            max_logs: 1000,
        }
    }

    pub fn log(&self, task_name: &str, level: LogLevel, message: &str, exit_code: Option<i32>) {
        let entry = LogEntry {
            id: Uuid::new_v4().to_string(),
            task_name: task_name.to_string(),
            timestamp: Utc::now().to_rfc3339(),
            level,
            message: message.to_string(),
            exit_code,
        };

        self.write_to_file(&entry);

        let mut logs = self.logs.lock();
        logs.push(entry);
        
        if logs.len() > self.max_logs {
            let remove_count = logs.len() - self.max_logs;
            logs.drain(0..remove_count);
        }
    }

    fn write_to_file(&self, entry: &LogEntry) {
        let date: DateTime<Utc> = Utc::now();
        let filename = format!("{}.log", date.format("%Y-%m-%d"));
        let file_path = self.log_dir.join(filename);

        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&file_path)
        {
            let line = format!(
                "[{}] [{}] [{}] {}{}\n",
                entry.timestamp,
                entry.level,
                entry.task_name,
                entry.message,
                entry.exit_code.map(|c| format!(" (exit code: {})", c)).unwrap_or_default()
            );
            let _ = file.write_all(line.as_bytes());
        }
    }

    pub fn get_logs(&self, task_name: Option<&str>, limit: Option<usize>) -> Vec<LogEntry> {
        let logs = self.logs.lock();
        let mut filtered: Vec<LogEntry> = if let Some(name) = task_name {
            logs.iter()
                .filter(|e| e.task_name == name)
                .cloned()
                .collect()
        } else {
            logs.clone()
        };

        filtered.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

        if let Some(limit) = limit {
            filtered.into_iter().take(limit).collect()
        } else {
            filtered
        }
    }

    pub fn clear(&self) {
        self.logs.lock().clear();
        
        if let Ok(entries) = fs::read_dir(&self.log_dir) {
            for entry in entries.flatten() {
                if let Some(ext) = entry.path().extension() {
                    if ext == "log" {
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
        }
    }

    pub fn info(&self, task_name: &str, message: &str) {
        self.log(task_name, LogLevel::Info, message, None);
    }

    pub fn warn(&self, task_name: &str, message: &str) {
        self.log(task_name, LogLevel::Warn, message, None);
    }

    pub fn error(&self, task_name: &str, message: &str) {
        self.log(task_name, LogLevel::Error, message, None);
    }

    pub fn success(&self, task_name: &str, message: &str, exit_code: i32) {
        self.log(task_name, LogLevel::Success, message, Some(exit_code));
    }

    pub fn failed(&self, task_name: &str, message: &str, exit_code: i32) {
        self.log(task_name, LogLevel::Error, message, Some(exit_code));
    }
}
