use anyhow::Result;
use std::path::PathBuf;

pub fn resolve_script_path(path: &str, working_dir: &str) -> Result<PathBuf> {
    let path_buf = PathBuf::from(path);
    if path_buf.is_absolute() {
        Ok(path_buf)
    } else {
        Ok(PathBuf::from(working_dir).join(path_buf))
    }
}

pub fn validate_script_extension(path: &str, script_type: super::engine::ScriptType) -> bool {
    let path = PathBuf::from(path);
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => match script_type {
            super::engine::ScriptType::Shell => {
                matches!(ext, "sh" | "bash" | "zsh" | "ps1" | "cmd" | "bat")
            }
            super::engine::ScriptType::Python => {
                matches!(ext, "py")
            }
        },
        None => false,
    }
}
