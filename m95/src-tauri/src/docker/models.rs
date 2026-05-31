use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Container {
    #[serde(rename = "Id")]
    pub id: String,
    #[serde(rename = "Names")]
    pub names: Vec<String>,
    #[serde(rename = "Image")]
    pub image: String,
    #[serde(rename = "State")]
    pub state: String,
    #[serde(rename = "Status")]
    pub status: String,
    #[serde(rename = "Ports")]
    pub ports: Option<Vec<Port>>,
    #[serde(rename = "NetworkSettings")]
    pub network_settings: Option<NetworkSettings>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Port {
    #[serde(rename = "IP")]
    pub ip: Option<String>,
    #[serde(rename = "PrivatePort")]
    pub private_port: u16,
    #[serde(rename = "PublicPort")]
    pub public_port: Option<u16>,
    #[serde(rename = "Type")]
    pub port_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkSettings {
    #[serde(rename = "Networks")]
    pub networks: HashMap<String, Network>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Network {
    #[serde(rename = "IPAddress")]
    pub ip_address: String,
    #[serde(rename = "NetworkID")]
    pub network_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerStats {
    pub container_id: String,
    pub container_name: String,
    pub cpu_percent: f64,
    pub memory_usage: u64,
    pub memory_limit: u64,
    pub memory_percent: f64,
    pub network_rx: u64,
    pub network_tx: u64,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryHistoryPoint {
    pub timestamp: i64,
    pub memory_usage: u64,
    pub container_id: String,
    pub container_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerLink {
    pub source: String,
    pub target: String,
    pub link_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopologyData {
    pub nodes: Vec<TopologyNode>,
    pub links: Vec<ContainerLink>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopologyNode {
    pub id: String,
    pub name: String,
    pub cpu_percent: f64,
    pub memory_percent: f64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub message: String,
    pub stream_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageLayer {
    pub id: String,
    pub created: i64,
    pub created_by: String,
    pub size: u64,
    pub comment: String,
    pub tags: Option<Vec<String>>,
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandOutput {
    pub line: String,
    pub stream_type: String,
    pub is_error: bool,
}
