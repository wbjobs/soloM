use crate::protocol::Point;
use serde::{Deserialize, Serialize};
use std::any::Any;
use std::error::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeStats {
    pub name: String,
    pub total_points: i64,
    pub total_requests: i64,
    pub error_count: i64,
    pub last_write_time: i64,
}

pub trait BackendNode: Send + Sync {
    fn name(&self) -> &str;
    fn write(&self, points: &[Point]) -> Result<(), Box<dyn Error + Send + Sync>>;
    fn query(&self, measurement: &str) -> Result<Vec<Point>, Box<dyn Error + Send + Sync>>;
    fn stats(&self) -> NodeStats;
    fn close(&self) -> Result<(), Box<dyn Error + Send + Sync>>;
    fn as_any(&self) -> &dyn Any;
}

#[derive(Debug, Clone)]
pub struct WriteTask {
    pub node_name: String,
    pub points: Vec<Point>,
}
