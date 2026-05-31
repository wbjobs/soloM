use config::{Config, ConfigError, Environment, File};
use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ExchangeConfig {
    pub name: String,
    pub ws_url: String,
    pub symbols: Vec<String>,
    pub use_mock: bool,
}

#[derive(Debug, Deserialize, Clone)]
pub struct OrderBookConfig {
    pub max_levels: usize,
    pub depth_calculation_levels: usize,
}

#[derive(Debug, Deserialize, Clone)]
pub struct MetricsConfig {
    pub update_interval_ms: u64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct LoggingConfig {
    pub level: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub exchange: ExchangeConfig,
    pub orderbook: OrderBookConfig,
    pub metrics: MetricsConfig,
    pub logging: LoggingConfig,
}

impl AppConfig {
    pub fn load() -> Result<Self, ConfigError> {
        let config = Config::builder()
            .add_source(File::with_name("config.yaml"))
            .add_source(Environment::with_prefix("APP").separator("__"))
            .build()?;
        config.try_deserialize()
    }
}
