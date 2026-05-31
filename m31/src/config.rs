use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AggregationConfig {
    pub enabled: bool,
    pub threshold_secs: u64,
    pub interval_secs: u64,
    pub method: AggregationMethod,
    pub flush_interval_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AggregationMethod {
    Avg,
    Min,
    Max,
    Sum,
}

impl Default for AggregationConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            threshold_secs: 300,
            interval_secs: 60,
            method: AggregationMethod::Avg,
            flush_interval_secs: 10,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub http_port: u16,
    pub backend_nodes: Vec<String>,
    pub hash_replicas: usize,
    pub async_queue_size: usize,
    pub worker_count: usize,
    pub aggregation: AggregationConfig,
}

impl Default for Config {
    fn default() -> Self {
        Self::default_config()
    }
}

impl Config {
    pub fn default_config() -> Self {
        Config {
            http_port: 8086,
            backend_nodes: vec![
                "cache-node-1".to_string(),
                "cache-node-2".to_string(),
                "cache-node-3".to_string(),
            ],
            hash_replicas: 100,
            async_queue_size: 10000,
            worker_count: 10,
            aggregation: AggregationConfig::default(),
        }
    }
}
