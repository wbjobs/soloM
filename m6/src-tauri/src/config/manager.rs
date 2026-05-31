use super::models::*;
use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;

#[derive(Clone)]
pub struct ConfigManager {
    config_dir: PathBuf,
    config_path: PathBuf,
    log_dir: PathBuf,
}

impl ConfigManager {
    pub fn new() -> Self {
        let config_dir = Self::get_config_dir();
        let config_path = config_dir.join("config.toml");
        let log_dir = config_dir.join("logs");
        
        Self {
            config_dir,
            config_path,
            log_dir,
        }
    }

    fn get_config_dir() -> PathBuf {
        if let Some(config_dir) = dirs::config_dir() {
            let dir = config_dir.join("HotkeyRunner");
            fs::create_dir_all(&dir).ok();
            dir
        } else {
            let dir = PathBuf::from(".hotkey-runner");
            fs::create_dir_all(&dir).ok();
            dir
        }
    }

    pub fn get_config_path(&self) -> PathBuf {
        self.config_path.clone()
    }

    pub fn get_log_dir(&self) -> PathBuf {
        fs::create_dir_all(&self.log_dir).ok();
        self.log_dir.clone()
    }

    pub fn load_config(&self) -> Result<AppConfig> {
        if self.config_path.exists() {
            let content = fs::read_to_string(&self.config_path)
                .with_context(|| format!("Failed to read config file: {:?}", self.config_path))?;
            let config: AppConfig = toml::from_str(&content)
                .with_context(|| "Failed to parse config file")?;
            Ok(config)
        } else {
            let config = AppConfig::default();
            self.save_config(&config)?;
            Ok(config)
        }
    }

    pub fn save_config(&self, config: &AppConfig) -> Result<()> {
        fs::create_dir_all(&self.config_dir)
            .with_context(|| format!("Failed to create config dir: {:?}", self.config_dir))?;
        
        let content = toml::to_string_pretty(config)
            .with_context(|| "Failed to serialize config")?;
        
        fs::write(&self.config_path, content)
            .with_context(|| format!("Failed to write config file: {:?}", self.config_path))?;
        
        Ok(())
    }

    pub fn get_tasks(&self) -> Result<Vec<Task>> {
        let config = self.load_config()?;
        Ok(config.tasks)
    }

    pub fn add_task(&self, task: Task) -> Result<()> {
        let mut config = self.load_config()?;
        
        if config.tasks.iter().any(|t| t.name == task.name) {
            return Err(anyhow::anyhow!("Task with name '{}' already exists", task.name));
        }
        
        config.tasks.push(task);
        self.save_config(&config)?;
        Ok(())
    }

    pub fn update_task(&self, task: Task) -> Result<()> {
        let mut config = self.load_config()?;
        
        if let Some(idx) = config.tasks.iter().position(|t| t.name == task.name) {
            config.tasks[idx] = task;
            self.save_config(&config)?;
            Ok(())
        } else {
            Err(anyhow::anyhow!("Task with name '{}' not found", task.name))
        }
    }

    pub fn delete_task(&self, name: &str) -> Result<()> {
        let mut config = self.load_config()?;
        
        if let Some(idx) = config.tasks.iter().position(|t| t.name == name) {
            config.tasks.remove(idx);
            self.save_config(&config)?;
            Ok(())
        } else {
            Err(anyhow::anyhow!("Task with name '{}' not found", name))
        }
    }

    pub fn get_task_by_hotkey(&self, hotkey: &str) -> Result<Option<Task>> {
        let config = self.load_config()?;
        Ok(config.tasks.into_iter().find(|t| t.hotkey == hotkey && t.enabled))
    }

    pub fn get_workflows(&self) -> Result<Vec<crate::workflow::Workflow>> {
        let config = self.load_config()?;
        Ok(config.workflows)
    }

    pub fn add_workflow(&self, workflow: crate::workflow::Workflow) -> Result<()> {
        let mut config = self.load_config()?;
        
        if config.workflows.iter().any(|w| w.id == workflow.id) {
            return Err(anyhow::anyhow!("Workflow with id '{}' already exists", workflow.id));
        }
        
        config.workflows.push(workflow);
        self.save_config(&config)?;
        Ok(())
    }

    pub fn update_workflow(&self, workflow: crate::workflow::Workflow) -> Result<()> {
        let mut config = self.load_config()?;
        
        if let Some(idx) = config.workflows.iter().position(|w| w.id == workflow.id) {
            config.workflows[idx] = workflow;
            self.save_config(&config)?;
            Ok(())
        } else {
            Err(anyhow::anyhow!("Workflow with id '{}' not found", workflow.id))
        }
    }

    pub fn delete_workflow(&self, id: &str) -> Result<()> {
        let mut config = self.load_config()?;
        
        if let Some(idx) = config.workflows.iter().position(|w| w.id == id) {
            config.workflows.remove(idx);
            self.save_config(&config)?;
            Ok(())
        } else {
            Err(anyhow::anyhow!("Workflow with id '{}' not found", id))
        }
    }

    pub fn get_workflow_by_id(&self, id: &str) -> Result<Option<crate::workflow::Workflow>> {
        let config = self.load_config()?;
        Ok(config.workflows.into_iter().find(|w| w.id == id))
    }
}

impl Default for ConfigManager {
    fn default() -> Self {
        Self::new()
    }
}
