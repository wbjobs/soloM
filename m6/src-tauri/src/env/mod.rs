use anyhow::{Context, Result};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct EnvLoader {
    loaded_env: HashMap<String, String>,
    shell_config_files: Vec<PathBuf>,
}

impl Default for EnvLoader {
    fn default() -> Self {
        Self::new()
    }
}

impl EnvLoader {
    pub fn new() -> Self {
        let mut shell_config_files = Vec::new();
        
        if let Some(home) = dirs::home_dir() {
            shell_config_files.push(home.join(".profile"));
            shell_config_files.push(home.join(".bash_profile"));
            shell_config_files.push(home.join(".bashrc"));
            shell_config_files.push(home.join(".zprofile"));
            shell_config_files.push(home.join(".zshrc"));
            shell_config_files.push(home.join(".config").join("zsh").join(".zshrc"));
        }
        
        Self {
            loaded_env: HashMap::new(),
            shell_config_files,
        }
    }

    pub fn with_custom_config_files(files: Vec<PathBuf>) -> Self {
        Self {
            loaded_env: HashMap::new(),
            shell_config_files: files,
        }
    }

    pub fn add_config_file(&mut self, path: PathBuf) {
        self.shell_config_files.push(path);
    }

    pub async fn load_user_environment(&mut self) -> Result<HashMap<String, String>> {
        let mut env = HashMap::new();
        
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
        
        let config_files_content = self.read_shell_config_files();
        
        let mut export_vars = Vec::new();
        
        for content in config_files_content {
            let vars = self.parse_shell_exports(&content);
            export_vars.extend(vars);
        }
        
        for (key, value) in export_vars {
            let expanded = self.expand_variables(&value, &env);
            env.insert(key, expanded);
        }
        
        if let Ok(path_env) = self.get_full_path(&shell).await {
            env.insert("PATH".to_string(), path_env);
        }
        
        self.loaded_env = env.clone();
        Ok(env)
    }

    async fn get_full_path(&self, shell: &str) -> Result<String> {
        let output = if cfg!(windows) {
            tokio::process::Command::new("cmd")
                .args(["/C", "echo %PATH%"])
                .output()
                .await
        } else {
            tokio::process::Command::new(shell)
                .args(["-i", "-c", "echo $PATH"])
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::null())
                .output()
                .await
        };

        match output {
            Ok(output) if output.status.success() => {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    Ok(path)
                } else {
                    Ok(std::env::var("PATH").unwrap_or_else(|_| "/usr/bin:/bin".to_string()))
                }
            }
            _ => {
                Ok(std::env::var("PATH").unwrap_or_else(|_| "/usr/local/bin:/usr/bin:/bin".to_string()))
            }
        }
    }

    fn read_shell_config_files(&self) -> Vec<String> {
        let mut contents = Vec::new();
        
        for path in &self.shell_config_files {
            if path.exists() {
                if let Ok(content) = std::fs::read_to_string(path) {
                    contents.push(content);
                }
            }
        }
        
        contents
    }

    fn parse_shell_exports(&self, content: &str) -> Vec<(String, String)> {
        let mut vars = Vec::new();
        
        for line in content.lines() {
            let line = line.trim();
            
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            
            if let Some(rest) = line.strip_prefix("export ") {
                if let Some((key, value)) = rest.split_once('=') {
                    let key = key.trim().to_string();
                    let value = self.strip_quotes(value.trim());
                    vars.push((key, value));
                }
            } else if let Some((key, value)) = line.split_once('=') {
                let key = key.trim();
                if key.chars().all(|c| c.is_alphanumeric() || c == '_') {
                    let value = self.strip_quotes(value.trim());
                    vars.push((key.to_string(), value));
                }
            }
        }
        
        vars
    }

    fn strip_quotes(&self, s: &str) -> String {
        let s = s.trim();
        if s.len() >= 2 {
            let bytes = s.as_bytes();
            if (bytes[0] == b'"' && bytes[s.len() - 1] == b'"')
                || (bytes[0] == b'\'' && bytes[s.len() - 1] == b'\'')
            {
                return s[1..s.len() - 1].to_string();
            }
        }
        s.to_string()
    }

    fn expand_variables(&self, value: &str, current_env: &HashMap<String, String>) -> String {
        let mut result = value.to_string();
        
        for (key, val) in current_env {
            result = result.replace(&format!("${}", key), val);
            result = result.replace(&format!("${{{}}}", key), val);
        }
        
        if let Ok(home) = std::env::var("HOME") {
            result = result.replace("~", &home);
        }
        
        result
    }

    pub fn get_env(&self, key: &str) -> Option<&String> {
        self.loaded_env.get(key)
    }

    pub fn get_all_env(&self) -> &HashMap<String, String> {
        &self.loaded_env
    }

    pub fn apply_to_command(&self, cmd: &mut tokio::process::Command, override_existing: bool) {
        for (key, value) in &self.loaded_env {
            if override_existing || std::env::var(key).is_err() {
                cmd.env(key, value);
            }
        }
    }
}

pub fn is_running_in_cron() -> bool {
    if std::env::var("CRON").is_ok() {
        return true;
    }
    
    if std::env::var("SSH_CLIENT").is_err() 
        && std::env::var("SSH_TTY").is_err()
        && std::env::var("TERM").is_err()
    {
        return true;
    }
    
    if let Ok(path) = std::env::var("PATH") {
        if path == "/usr/bin:/bin" || path.is_empty() {
            return true;
        }
    }
    
    false
}

pub fn get_detected_shell() -> Option<PathBuf> {
    if let Ok(shell) = std::env::var("SHELL") {
        return Some(PathBuf::from(shell));
    }
    
    if cfg!(target_os = "macos") {
        if Path::new("/bin/zsh").exists() {
            return Some(PathBuf::from("/bin/zsh"));
        }
    }
    
    if Path::new("/bin/bash").exists() {
        return Some(PathBuf::from("/bin/bash"));
    }
    
    if Path::new("/bin/sh").exists() {
        return Some(PathBuf::from("/bin/sh"));
    }
    
    None
}

pub fn get_shell_config_files(shell: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    
    if let Some(home) = dirs::home_dir() {
        let shell_name = shell.file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("sh");
        
        match shell_name {
            "zsh" => {
                files.push(home.join(".zshenv"));
                files.push(home.join(".zprofile"));
                files.push(home.join(".zshrc"));
                files.push(home.join(".zlogin"));
            }
            "bash" => {
                files.push(home.join(".bash_profile"));
                files.push(home.join(".bashrc"));
                files.push(home.join(".profile"));
            }
            _ => {
                files.push(home.join(".profile"));
            }
        }
    }
    
    files
}
