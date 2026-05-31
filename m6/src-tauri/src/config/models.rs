use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::workflow::Workflow;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub general: GeneralConfig,
    pub tasks: Vec<Task>,
    #[serde(default)]
    pub workflows: Vec<Workflow>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeneralConfig {
    pub auto_start: bool,
    pub log_retention_days: i32,
    pub theme: String,
}

impl Default for GeneralConfig {
    fn default() -> Self {
        Self {
            auto_start: false,
            log_retention_days: 7,
            theme: "dark".to_string(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Task {
    pub name: String,
    pub description: String,
    pub hotkey: String,
    pub script_type: ScriptType,
    pub script_path: String,
    pub working_dir: String,
    pub enabled: bool,
    #[serde(default)]
    pub script_content: Option<String>,
    pub env: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ScriptType {
    Shell,
    Python,
}

impl std::fmt::Display for ScriptType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ScriptType::Shell => write!(f, "shell"),
            ScriptType::Python => write!(f, "python"),
        }
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            general: GeneralConfig::default(),
            tasks: vec![
                Task {
                    name: "hello-world".to_string(),
                    description: "示例任务 - 打印 Hello World".to_string(),
                    hotkey: "Ctrl+Shift+H".to_string(),
                    script_type: ScriptType::Shell,
                    script_path: "".to_string(),
                    working_dir: ".".to_string(),
                    enabled: true,
                    script_content: Some("echo 'Hello World from HotkeyRunner!'".to_string()),
                    env: None,
                },
            ],
            workflows: vec![],
        }
    }
}
