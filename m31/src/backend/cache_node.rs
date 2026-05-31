use super::{BackendNode, NodeStats};
use crate::protocol::Point;
use std::collections::HashMap;
use std::error::Error;
use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct MemoryCacheNode {
    name: String,
    storage: RwLock<HashMap<String, Vec<Point>>>,
    total_points: std::sync::atomic::AtomicI64,
    total_requests: std::sync::atomic::AtomicI64,
    error_count: std::sync::atomic::AtomicI64,
    last_write: std::sync::atomic::AtomicI64,
}

impl MemoryCacheNode {
    pub fn new(name: String) -> Self {
        MemoryCacheNode {
            name,
            storage: RwLock::new(HashMap::new()),
            total_points: std::sync::atomic::AtomicI64::new(0),
            total_requests: std::sync::atomic::AtomicI64::new(0),
            error_count: std::sync::atomic::AtomicI64::new(0),
            last_write: std::sync::atomic::AtomicI64::new(0),
        }
    }

    pub fn get_all_measurements(&self) -> Vec<String> {
        let storage = self.storage.read().unwrap();
        storage.keys().cloned().collect()
    }

    pub fn clear(&self) {
        let mut storage = self.storage.write().unwrap();
        storage.clear();
        self.total_points
            .store(0, std::sync::atomic::Ordering::SeqCst);
        self.total_requests
            .store(0, std::sync::atomic::Ordering::SeqCst);
        self.error_count
            .store(0, std::sync::atomic::Ordering::SeqCst);
    }
}

impl BackendNode for MemoryCacheNode {
    fn name(&self) -> &str {
        &self.name
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn write(&self, points: &[Point]) -> Result<(), Box<dyn Error + Send + Sync>> {
        if points.is_empty() {
            return Err("no points to write".into());
        }

        self.total_requests
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);

        let mut storage = self.storage.write().unwrap();

        for point in points {
            let key = point.measurement.clone();
            storage.entry(key).or_default().push(point.clone());
            self.total_points
                .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        }

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos() as i64;
        self.last_write
            .store(now, std::sync::atomic::Ordering::SeqCst);

        Ok(())
    }

    fn query(&self, measurement: &str) -> Result<Vec<Point>, Box<dyn Error + Send + Sync>> {
        self.total_requests
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);

        let storage = self.storage.read().unwrap();

        match storage.get(measurement) {
            Some(points) => Ok(points.clone()),
            None => Ok(vec![]),
        }
    }

    fn stats(&self) -> NodeStats {
        NodeStats {
            name: self.name.clone(),
            total_points: self
                .total_points
                .load(std::sync::atomic::Ordering::SeqCst),
            total_requests: self
                .total_requests
                .load(std::sync::atomic::Ordering::SeqCst),
            error_count: self
                .error_count
                .load(std::sync::atomic::Ordering::SeqCst),
            last_write_time: self
                .last_write
                .load(std::sync::atomic::Ordering::SeqCst),
        }
    }

    fn close(&self) -> Result<(), Box<dyn Error + Send + Sync>> {
        self.clear();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::Point;
    use std::collections::HashMap;
    use std::time::SystemTime;

    #[test]
    fn test_write() {
        let node = MemoryCacheNode::new("test-node".to_string());

        let points = vec![
            Point {
                measurement: "cpu".to_string(),
                tags: HashMap::new(),
                fields: vec![],
                timestamp: SystemTime::now(),
                raw_line: "cpu value=1".to_string(),
            },
            Point {
                measurement: "memory".to_string(),
                tags: HashMap::new(),
                fields: vec![],
                timestamp: SystemTime::now(),
                raw_line: "memory value=2".to_string(),
            },
            Point {
                measurement: "cpu".to_string(),
                tags: HashMap::new(),
                fields: vec![],
                timestamp: SystemTime::now(),
                raw_line: "cpu value=3".to_string(),
            },
        ];

        node.write(&points).unwrap();

        let stats = node.stats();
        assert_eq!(stats.total_points, 3);
        assert_eq!(stats.total_requests, 1);
    }

    #[test]
    fn test_query() {
        let node = MemoryCacheNode::new("test-node".to_string());

        let points = vec![
            Point {
                measurement: "cpu".to_string(),
                tags: HashMap::new(),
                fields: vec![],
                timestamp: SystemTime::now(),
                raw_line: "cpu value=1".to_string(),
            },
            Point {
                measurement: "cpu".to_string(),
                tags: HashMap::new(),
                fields: vec![],
                timestamp: SystemTime::now(),
                raw_line: "cpu value=2".to_string(),
            },
            Point {
                measurement: "memory".to_string(),
                tags: HashMap::new(),
                fields: vec![],
                timestamp: SystemTime::now(),
                raw_line: "memory value=1".to_string(),
            },
        ];

        node.write(&points).unwrap();

        let cpu_points = node.query("cpu").unwrap();
        assert_eq!(cpu_points.len(), 2);

        let memory_points = node.query("memory").unwrap();
        assert_eq!(memory_points.len(), 1);

        let non_existent = node.query("disk").unwrap();
        assert_eq!(non_existent.len(), 0);
    }

    #[test]
    fn test_get_all_measurements() {
        let node = MemoryCacheNode::new("test-node".to_string());

        let points = vec![
            Point {
                measurement: "cpu".to_string(),
                tags: HashMap::new(),
                fields: vec![],
                timestamp: SystemTime::now(),
                raw_line: "cpu value=1".to_string(),
            },
            Point {
                measurement: "memory".to_string(),
                tags: HashMap::new(),
                fields: vec![],
                timestamp: SystemTime::now(),
                raw_line: "memory value=1".to_string(),
            },
            Point {
                measurement: "disk".to_string(),
                tags: HashMap::new(),
                fields: vec![],
                timestamp: SystemTime::now(),
                raw_line: "disk value=1".to_string(),
            },
        ];

        node.write(&points).unwrap();

        let measurements = node.get_all_measurements();
        assert_eq!(measurements.len(), 3);
        assert!(measurements.contains(&"cpu".to_string()));
        assert!(measurements.contains(&"memory".to_string()));
        assert!(measurements.contains(&"disk".to_string()));
    }

    #[test]
    fn test_clear() {
        let node = MemoryCacheNode::new("test-node".to_string());

        let points = vec![Point {
            measurement: "cpu".to_string(),
            tags: HashMap::new(),
            fields: vec![],
            timestamp: SystemTime::now(),
            raw_line: "cpu value=1".to_string(),
        }];

        node.write(&points).unwrap();
        node.clear();

        let stats = node.stats();
        assert_eq!(stats.total_points, 0);

        let points_after = node.query("cpu").unwrap();
        assert_eq!(points_after.len(), 0);
    }
}
