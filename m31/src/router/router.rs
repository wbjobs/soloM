use super::HashRing;
use crate::protocol::Point;
use std::collections::HashMap;

#[derive(Debug)]
pub struct Router {
    hash_ring: HashRing,
}

impl Router {
    pub fn new(backend_nodes: &[String], hash_replicas: usize) -> Result<Self, String> {
        if backend_nodes.is_empty() {
            return Err("no backend nodes provided".to_string());
        }

        let mut hash_ring = HashRing::new(hash_replicas);
        hash_ring.add_nodes(backend_nodes);

        Ok(Router { hash_ring })
    }

    pub fn route(
        &self,
        points: &[Point],
    ) -> Result<HashMap<String, Vec<Point>>, String> {
        let mut result: HashMap<String, Vec<Point>> = HashMap::new();

        for point in points {
            let node = self
                .hash_ring
                .get_node(point.sharding_key())
                .map_err(|e| format!("routing failed for point {}: {}", point.measurement, e))?;

            result
                .entry(node)
                .or_default()
                .push(point.clone());
        }

        Ok(result)
    }

    pub fn route_with_healthy_nodes(
        &self,
        points: &[Point],
        healthy_nodes: &[String],
    ) -> Result<HashMap<String, Vec<Point>>, String> {
        if healthy_nodes.is_empty() {
            return Err("no healthy nodes available".to_string());
        }

        let mut healthy_ring = HashRing::new(self.hash_ring.replica_count());
        healthy_ring.add_nodes(healthy_nodes);

        let mut result: HashMap<String, Vec<Point>> = HashMap::new();

        for point in points {
            let node = healthy_ring
                .get_node(point.sharding_key())
                .map_err(|e| format!("routing failed for point {}: {}", point.measurement, e))?;

            result
                .entry(node)
                .or_default()
                .push(point.clone());
        }

        Ok(result)
    }

    pub fn get_node_for_measurement(&self, measurement: &str) -> Result<String, String> {
        self.hash_ring.get_node(measurement)
    }

    pub fn get_nodes(&self) -> Vec<String> {
        self.hash_ring.get_nodes()
    }

    pub fn node_count(&self) -> usize {
        self.hash_ring.node_count()
    }

    pub fn add_node(&mut self, node: &str) {
        self.hash_ring.add_node(node);
    }

    pub fn remove_node(&mut self, node: &str) {
        self.hash_ring.remove_node(node);
    }
}

impl std::fmt::Display for Router {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.hash_ring)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::Point;
    use std::collections::HashMap;
    use std::time::SystemTime;

    #[test]
    fn test_route() {
        let backend_nodes = vec![
            "cache-node-1".to_string(),
            "cache-node-2".to_string(),
            "cache-node-3".to_string(),
        ];
        let router = Router::new(&backend_nodes, 100).unwrap();

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
                measurement: "disk".to_string(),
                tags: HashMap::new(),
                fields: vec![],
                timestamp: SystemTime::now(),
                raw_line: "disk value=3".to_string(),
            },
            Point {
                measurement: "network".to_string(),
                tags: HashMap::new(),
                fields: vec![],
                timestamp: SystemTime::now(),
                raw_line: "network value=4".to_string(),
            },
            Point {
                measurement: "cpu".to_string(),
                tags: HashMap::new(),
                fields: vec![],
                timestamp: SystemTime::now(),
                raw_line: "cpu value=5".to_string(),
            },
        ];

        let routed = router.route(&points).unwrap();

        let total_routed: usize = routed.values().map(|v| v.len()).sum();
        assert_eq!(total_routed, points.len());

        let cpu_node = router.get_node_for_measurement("cpu").unwrap();
        assert!(
            routed.get(&cpu_node).unwrap().len() >= 2,
            "Expected at least 2 cpu points on node {}",
            cpu_node
        );
    }

    #[test]
    fn test_new_router_empty() {
        let result = Router::new(&[], 10);
        assert!(result.is_err());
    }
}
