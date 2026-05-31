use anyhow::{anyhow, Result};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Clone)]
pub struct HotkeyManager {
    registered: Arc<Mutex<HashMap<String, String>>>,
}

impl HotkeyManager {
    pub fn new() -> Self {
        Self {
            registered: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn register(&self, hotkey: &str, task_name: &str) -> Result<()> {
        let mut registered = self.registered.lock();
        if registered.contains_key(hotkey) {
            return Err(anyhow!("Hotkey '{}' is already registered", hotkey));
        }
        registered.insert(hotkey.to_string(), task_name.to_string());
        Ok(())
    }

    pub fn unregister(&self, hotkey: &str) -> Result<()> {
        let mut registered = self.registered.lock();
        if registered.remove(hotkey).is_none() {
            return Err(anyhow!("Hotkey '{}' is not registered", hotkey));
        }
        Ok(())
    }

    pub fn get_task_for_hotkey(&self, hotkey: &str) -> Option<String> {
        let registered = self.registered.lock();
        registered.get(hotkey).cloned()
    }

    pub fn get_all_registered(&self) -> Vec<(String, String)> {
        let registered = self.registered.lock();
        registered.iter().map(|(k, v)| (k.clone(), v.clone())).collect()
    }

    pub fn is_registered(&self, hotkey: &str) -> bool {
        let registered = self.registered.lock();
        registered.contains_key(hotkey)
    }

    pub fn clear(&self) {
        self.registered.lock().clear();
    }
}

impl Default for HotkeyManager {
    fn default() -> Self {
        Self::new()
    }
}

pub fn normalize_hotkey(hotkey: &str) -> String {
    let parts: Vec<&str> = hotkey.split('+').collect();
    let mut modifiers: Vec<&str> = parts.iter()
        .filter(|p| p.len() > 1)
        .map(|s| *s)
        .collect();
    let key: Vec<&str> = parts.iter()
        .filter(|p| p.len() == 1)
        .map(|s| *s)
        .collect();
    
    let mut normalized = String::new();
    for m in modifiers {
        normalized.push_str(m);
        normalized.push('+');
    }
    if let Some(k) = key.first() {
        normalized.push_str(k);
    }
    
    normalized
}

pub fn parse_hotkey(hotkey_str: &str) -> Result<(Vec<String>, String)> {
    let parts: Vec<&str> = hotkey_str.split('+').collect();
    let mut modifiers = Vec::new();
    let mut key = String::new();

    for part in parts {
        let part_uppercase = part.to_uppercase();
        match part_uppercase.as_str() {
            "CTRL" | "CONTROL" => modifiers.push("Control".to_string()),
            "SHIFT" => modifiers.push("Shift".to_string()),
            "ALT" | "OPTION" => modifiers.push("Alt".to_string()),
            "META" | "CMD" | "COMMAND" | "SUPER" | "WIN" => modifiers.push("Meta".to_string()),
            _ => key = part.to_string(),
        }
    }

    if key.is_empty() {
        return Err(anyhow!("No key specified in hotkey: {}", hotkey_str));
    }

    Ok((modifiers, key))
}
