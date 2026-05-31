use super::models::*;
use super::transport::{DockerTransportManager, TransportKind};
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
struct DockerStatsResponse {
    #[serde(rename = "cpu_stats")]
    cpu_stats: CpuStats,
    #[serde(rename = "precpu_stats")]
    precpu_stats: CpuStats,
    #[serde(rename = "memory_stats")]
    memory_stats: MemoryStats,
    #[serde(rename = "networks")]
    networks: Option<HashMap<String, NetworkStats>>,
}

#[derive(Debug, Deserialize)]
struct CpuStats {
    #[serde(rename = "cpu_usage")]
    cpu_usage: CpuUsage,
    #[serde(rename = "system_cpu_usage")]
    system_cpu_usage: Option<u64>,
    #[serde(rename = "online_cpus")]
    online_cpus: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct CpuUsage {
    #[serde(rename = "total_usage")]
    total_usage: u64,
    #[serde(rename = "percpu_usage")]
    percpu_usage: Option<Vec<u64>>,
}

#[derive(Debug, Deserialize)]
struct MemoryStats {
    #[serde(rename = "usage")]
    usage: u64,
    #[serde(rename = "limit")]
    limit: u64,
}

#[derive(Debug, Deserialize)]
struct NetworkStats {
    #[serde(rename = "rx_bytes")]
    rx_bytes: u64,
    #[serde(rename = "tx_bytes")]
    tx_bytes: u64,
}

pub struct DockerClient {
    transport: DockerTransportManager,
}

impl DockerClient {
    pub fn new() -> Self {
        Self {
            transport: DockerTransportManager::new(),
        }
    }

    pub fn get_transport_kind(&self) -> TransportKind {
        self.transport.get_transport_kind()
    }

    pub async fn list_containers(&self) -> Result<Vec<Container>, String> {
        let body = self.transport.get_text("/containers/json?all=true").await?;
        serde_json::from_str(&body)
            .map_err(|e| format!("Failed to parse containers: {}", e))
    }

    pub async fn get_container_stats(&self, container_id: &str) -> Result<ContainerStats, String> {
        let path = format!("/containers/{}/stats?stream=false", container_id);
        let body = self.transport.get_text(&path).await?;
        let stats: DockerStatsResponse = serde_json::from_str(&body)
            .map_err(|e| format!("Failed to parse stats: {}", e))?;

        let cpu_percent = self.calculate_cpu_percent(&stats);
        let memory_percent =
            (stats.memory_stats.usage as f64 / stats.memory_stats.limit as f64) * 100.0;

        let (network_rx, network_tx) = self.calculate_network_stats(&stats.networks);

        Ok(ContainerStats {
            container_id: container_id.to_string(),
            container_name: String::new(),
            cpu_percent,
            memory_usage: stats.memory_stats.usage,
            memory_limit: stats.memory_stats.limit,
            memory_percent,
            network_rx,
            network_tx,
            timestamp: chrono::Utc::now().timestamp(),
        })
    }

    fn calculate_cpu_percent(&self, stats: &DockerStatsResponse) -> f64 {
        let cpu_delta =
            stats.cpu_stats.cpu_usage.total_usage as f64 - stats.precpu_stats.cpu_usage.total_usage as f64;
        let system_delta = stats.cpu_stats.system_cpu_usage.unwrap_or(0) as f64
            - stats.precpu_stats.system_cpu_usage.unwrap_or(0) as f64;

        if system_delta > 0.0 && cpu_delta > 0.0 {
            let online_cpus = stats.cpu_stats.online_cpus.unwrap_or(1) as f64;
            (cpu_delta / system_delta) * online_cpus * 100.0
        } else {
            0.0
        }
    }

    fn calculate_network_stats(
        &self,
        networks: &Option<HashMap<String, NetworkStats>>,
    ) -> (u64, u64) {
        if let Some(nets) = networks {
            let mut rx = 0;
            let mut tx = 0;
            for net in nets.values() {
                rx += net.rx_bytes;
                tx += net.tx_bytes;
            }
            (rx, tx)
        } else {
            (0, 0)
        }
    }

    pub async fn get_container_logs(&self, container_id: &str, tail: u32) -> Result<Vec<LogEntry>, String> {
        let path = format!(
            "/containers/{}/logs?stdout=true&stderr=true&timestamps=true&tail={}",
            container_id, tail
        );
        let body = self.transport.get_text(&path).await?;
        Ok(self.parse_logs(&body))
    }

    pub async fn get_image_layers(&self, image_name: &str) -> Result<Vec<ImageLayer>, String> {
        let encoded = urlencoding::encode(image_name);
        let path = format!("/images/{}/history", encoded);
        let body = self.transport.get_text(&path).await?;

        #[derive(Deserialize)]
        struct RawLayer {
            #[serde(rename = "Id")]
            id: Option<String>,
            #[serde(rename = "Created")]
            created: i64,
            #[serde(rename = "CreatedBy")]
            created_by: String,
            #[serde(rename = "Size")]
            size: u64,
            #[serde(rename = "Comment")]
            comment: String,
            #[serde(rename = "Tags")]
            tags: Option<Vec<String>>,
        }

        let raw_layers: Vec<RawLayer> = serde_json::from_str(&body)
            .map_err(|e| format!("Failed to parse image layers: {}", e))?;

        let mut layers = Vec::new();
        let mut prev_id: Option<String> = None;
        for raw in raw_layers {
            let id = raw.id.unwrap_or_else(|| format!("<missing>"));
            let parent_id = prev_id.clone();
            prev_id = Some(id.clone());

            layers.push(ImageLayer {
                id,
                created: raw.created,
                created_by: raw.created_by,
                size: raw.size,
                comment: raw.comment,
                tags: raw.tags,
                parent_id,
            });
        }

        Ok(layers)
    }

    fn parse_logs(&self, raw_logs: &str) -> Vec<LogEntry> {
        let mut entries = Vec::new();
        for line in raw_logs.lines() {
            if line.len() > 8 {
                let stream_type = match line.as_bytes()[0] {
                    1 => "stdout",
                    2 => "stderr",
                    _ => "unknown",
                };
                let content = &line[8..];
                if let Some((timestamp, message)) = content.split_once(' ') {
                    entries.push(LogEntry {
                        timestamp: timestamp.to_string(),
                        message: message.to_string(),
                        stream_type: stream_type.to_string(),
                    });
                }
            }
        }
        entries
    }

    pub async fn get_topology(&self) -> Result<TopologyData, String> {
        let containers = self.list_containers().await?;
        let mut nodes = Vec::new();
        let mut links = Vec::new();

        let mut network_containers: HashMap<String, Vec<String>> = HashMap::new();

        for container in &containers {
            let stats = self.get_container_stats(&container.id).await.unwrap_or(ContainerStats {
                container_id: container.id.clone(),
                container_name: container.names.first().cloned().unwrap_or_default(),
                cpu_percent: 0.0,
                memory_usage: 0,
                memory_limit: 0,
                memory_percent: 0.0,
                network_rx: 0,
                network_tx: 0,
                timestamp: 0,
            });

            nodes.push(TopologyNode {
                id: container.id.clone(),
                name: container
                    .names
                    .first()
                    .cloned()
                    .unwrap_or_else(|| container.id[..12].to_string()),
                cpu_percent: stats.cpu_percent,
                memory_percent: stats.memory_percent,
                status: container.state.clone(),
            });

            if let Some(ns) = &container.network_settings {
                for (network_name, _) in &ns.networks {
                    network_containers
                        .entry(network_name.clone())
                        .or_default()
                        .push(container.id.clone());
                }
            }
        }

        for (_, container_ids) in network_containers {
            for i in 0..container_ids.len() {
                for j in (i + 1)..container_ids.len() {
                    links.push(ContainerLink {
                        source: container_ids[i].clone(),
                        target: container_ids[j].clone(),
                        link_type: "network".to_string(),
                    });
                }
            }
        }

        Ok(TopologyData { nodes, links })
    }
}
