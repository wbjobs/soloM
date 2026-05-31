use clap::{Parser, Subcommand};
use crate::config::ConfigManager;
use crate::config::models::{ScriptType, Task};
use crate::env::EnvLoader;
use crate::logger::LogCollector;
use crate::script::ScriptEngine;
use anyhow::Result;
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "hotkey-cli", version, about = "HotkeyRunner CLI - 快捷键自动化工具命令行版本", long_about = None)]
pub struct Cli {
    #[arg(short, long, value_name = "FILE")]
    pub config: Option<PathBuf>,
    
    #[arg(long, help = "从用户 shell 配置文件加载环境变量（默认在 Cron 环境自动启用）")]
    pub load_env: bool,
    
    #[arg(long, help = "禁止自动加载用户环境变量")]
    pub no_load_env: bool,
    
    #[arg(long, value_name = "FILE", help = "从指定文件加载额外的环境变量")]
    pub env_file: Option<PathBuf>,
    
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand)]
pub enum Commands {
    #[command(about = "列出所有已配置的任务")]
    List {
        #[arg(short, long)]
        all: bool,
    },
    
    #[command(about = "添加新任务")]
    Add {
        name: String,
        #[arg(short, long)]
        hotkey: String,
        #[arg(short, long)]
        script: String,
        #[arg(short, long, default_value = "shell")]
        script_type: String,
        #[arg(short, long)]
        working_dir: Option<String>,
        #[arg(short, long)]
        description: Option<String>,
    },
    
    #[command(about = "删除任务")]
    Remove {
        name: String,
    },
    
    #[command(about = "执行指定任务")]
    Run {
        name: String,
    },
    
    #[command(about = "启动后台监听模式（监听快捷键）")]
    Start,
    
    #[command(about = "停止后台监听")]
    Stop,
    
    #[command(about = "查看当前运行状态")]
    Status,
    
    #[command(about = "查看执行日志")]
    Logs {
        #[arg(short, long)]
        task: Option<String>,
        #[arg(short, long, default_value = "50")]
        limit: usize,
    },
    
    #[command(about = "管理配置文件")]
    Config {
        #[command(subcommand)]
        command: ConfigCommands,
    },
}

#[derive(Subcommand)]
pub enum ConfigCommands {
    #[command(about = "显示配置文件路径")]
    Path,
    #[command(about = "显示当前配置内容")]
    Show,
    #[command(about = "重新加载配置文件")]
    Reload,
    #[command(about = "编辑配置文件")]
    Edit,
}

pub struct CliRunner {
    config_manager: ConfigManager,
    script_engine: ScriptEngine,
    logger: LogCollector,
    env_loader: Option<EnvLoader>,
}

impl CliRunner {
    pub fn new() -> Self {
        let config_manager = ConfigManager::new();
        let logger = LogCollector::new(config_manager.get_log_dir());
        let script_engine = ScriptEngine::new(logger.clone());
        
        Self {
            config_manager,
            script_engine,
            logger,
            env_loader: None,
        }
    }

    pub fn with_config_path(config_path: Option<PathBuf>) -> Self {
        let mut runner = Self::new();
        if let Some(path) = config_path {
            if path.exists() {
                if let Ok(parent) = path.parent() {
                    if !parent.as_os_str().is_empty() {
                        std::fs::create_dir_all(parent).ok();
                    }
                }
            }
        }
        runner
    }

    pub async fn with_cli_args(mut self, cli: &Cli) -> Result<Self> {
        use crate::env::{is_running_in_cron, get_detected_shell, get_shell_config_files};
        
        let in_cron = is_running_in_cron();
        let should_load_env = cli.load_env || (in_cron && !cli.no_load_env);
        
        if should_load_env {
            let mut env_loader = if let Some(shell) = get_detected_shell() {
                let config_files = get_shell_config_files(&shell);
                EnvLoader::with_custom_config_files(config_files)
            } else {
                EnvLoader::new()
            };
            
            if let Some(env_file) = &cli.env_file {
                env_loader.add_config_file(env_file.clone());
            }
            
            match env_loader.load_user_environment().await {
                Ok(env) => {
                    tracing::info!("Loaded {} environment variables from user shell config", env.len());
                    if in_cron {
                        tracing::info!("Detected Cron environment, user environment loaded successfully");
                    }
                    self.script_engine = self.script_engine.with_env_loader(env_loader.clone());
                    self.env_loader = Some(env_loader);
                }
                Err(e) => {
                    tracing::warn!("Failed to load user environment: {}", e);
                }
            }
        }
        
        if cli.no_load_env {
            self.script_engine.set_auto_load_env(false);
        }
        
        Ok(self)
    }

    pub async fn run(&self, cli: Cli) -> Result<()> {
        match cli.command {
            Commands::List { all } => self.list_tasks(all).await,
            Commands::Add { name, hotkey, script, script_type, working_dir, description } => {
                self.add_task(name, hotkey, script, script_type, working_dir, description).await
            }
            Commands::Remove { name } => self.remove_task(&name).await,
            Commands::Run { name } => self.run_task(&name).await,
            Commands::Start => self.start_listener().await,
            Commands::Stop => self.stop_listener().await,
            Commands::Status => self.show_status().await,
            Commands::Logs { task, limit } => self.show_logs(task.as_deref(), limit).await,
            Commands::Config { command } => self.handle_config(command).await,
        }
    }

    async fn list_tasks(&self, all: bool) -> Result<()> {
        let tasks = self.config_manager.get_tasks()?;
        let filtered: Vec<_> = if all {
            tasks
        } else {
            tasks.into_iter().filter(|t| t.enabled).collect()
        };

        if filtered.is_empty() {
            println!("暂无配置的任务");
        } else {
            println!("{:<20} {:<20} {:<10} {}", "名称", "快捷键", "类型", "描述");
            println!("{}", "-".repeat(70));
            for task in filtered {
                println!(
                    "{:<20} {:<20} {:<10} {}",
                    task.name,
                    task.hotkey,
                    task.script_type,
                    task.description
                );
            }
        }
        Ok(())
    }

    async fn add_task(
        &self,
        name: String,
        hotkey: String,
        script: String,
        script_type: String,
        working_dir: Option<String>,
        description: Option<String>,
    ) -> Result<()> {
        let script_type = match script_type.to_lowercase().as_str() {
            "python" | "py" => ScriptType::Python,
            _ => ScriptType::Shell,
        };

        let task = Task {
            name: name.clone(),
            description: description.unwrap_or_else(|| format!("Task: {}", name)),
            hotkey,
            script_type,
            script_path: if std::path::Path::new(&script).exists() {
                script.clone()
            } else {
                String::new()
            },
            working_dir: working_dir.unwrap_or_else(|| ".".to_string()),
            enabled: true,
            script_content: if !std::path::Path::new(&script).exists() {
                Some(script)
            } else {
                None
            },
            env: None,
        };

        self.config_manager.add_task(task)?;
        println!("任务 '{}' 已成功添加", name);
        Ok(())
    }

    async fn remove_task(&self, name: &str) -> Result<()> {
        self.config_manager.delete_task(name)?;
        println!("任务 '{}' 已成功删除", name);
        Ok(())
    }

    async fn run_task(&self, name: &str) -> Result<()> {
        let config = self.config_manager.load_config()?;
        let task = config.tasks.into_iter().find(|t| t.name == name)
            .ok_or_else(|| anyhow::anyhow!("Task '{}' not found", name))?;

        println!("执行任务: {}", name);
        println!("{}", "=".repeat(50));

        let state = self.script_engine.execute(&task).await?;
        
        println!("{}", "=".repeat(50));
        println!("状态: {:?}", state.status);
        if let Some(exit_code) = state.exit_code {
            println!("退出码: {}", exit_code);
        }
        if !state.output.is_empty() {
            println!("输出:\n{}", state.output);
        }

        Ok(())
    }

    async fn start_listener(&self) -> Result<()> {
        println!("快捷键监听模式启动中...");
        println!("按 Ctrl+C 停止监听");
        println!("已启用的快捷键:");
        
        let tasks = self.config_manager.get_tasks()?;
        for task in tasks.iter().filter(|t| t.enabled) {
            println!("  {} - {}", task.hotkey, task.name);
        }

        Ok(())
    }

    async fn stop_listener(&self) -> Result<()> {
        println!("快捷键监听已停止");
        Ok(())
    }

    async fn show_status(&self) -> Result<()> {
        let config = self.config_manager.load_config()?;
        
        println!("HotkeyRunner 状态");
        println!("{}", "=".repeat(30));
        println!("配置文件: {:?}", self.config_manager.get_config_path());
        println!("日志目录: {:?}", self.config_manager.get_log_dir());
        println!("任务总数: {}", config.tasks.len());
        println!("已启用任务: {}", config.tasks.iter().filter(|t| t.enabled).count());
        println!("主题: {}", config.general.theme);
        println!("自动启动: {}", if config.general.auto_start { "是" } else { "否" });
        println!("日志保留天数: {}", config.general.log_retention_days);
        
        Ok(())
    }

    async fn show_logs(&self, task_name: Option<&str>, limit: usize) -> Result<()> {
        let logs = self.logger.get_logs(task_name, Some(limit));
        
        if logs.is_empty() {
            println!("暂无日志记录");
        } else {
            for log in logs {
                println!(
                    "[{}] [{}] [{}] {}",
                    log.timestamp,
                    log.level,
                    log.task_name,
                    log.message
                );
            }
        }
        Ok(())
    }

    async fn handle_config(&self, command: ConfigCommands) -> Result<()> {
        match command {
            ConfigCommands::Path => {
                println!("{}", self.config_manager.get_config_path().display());
            }
            ConfigCommands::Show => {
                let config = self.config_manager.load_config()?;
                println!("{}", toml::to_string_pretty(&config)?);
            }
            ConfigCommands::Reload => {
                let _ = self.config_manager.load_config()?;
                println!("配置已重新加载");
            }
            ConfigCommands::Edit => {
                let path = self.config_manager.get_config_path();
                println!("请使用编辑器打开配置文件: {}", path.display());
                
                #[cfg(windows)]
                {
                    let _ = std::process::Command::new("notepad").arg(&path).spawn();
                }
                #[cfg(unix)]
                {
                    let editor = std::env::var("EDITOR").unwrap_or_else(|_| "vi".to_string());
                    let _ = std::process::Command::new(editor).arg(&path).status();
                }
            }
        }
        Ok(())
    }
}
