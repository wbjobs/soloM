use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::sync::RwLock;

#[derive(Debug)]
pub struct HashRing {
    replicas: usize,
    ring: BTreeMap<u64, String>,
    nodes: std::collections::HashSet<String>,
    mu: RwLock<()>,
}

impl HashRing {
    pub fn new(replicas: usize) -> Self {
        HashRing {
            replicas,
            ring: BTreeMap::new(),
            nodes: std::collections::HashSet::new(),
            mu: RwLock::new(()),
        }
    }

    fn hash_key(&self, key: &str) -> u64 {
        let mut hasher = Sha256::new();
        hasher.update(key.as_bytes());
        let hash_bytes = hasher.finalize();
        let mut bytes = [0u8; 8];
        bytes.copy_from_slice(&hash_bytes[..8]);
        u64::from_be_bytes(bytes)
    }

    pub fn add_node(&mut self, node: &str) {
        let _lock = self.mu.write().unwrap();
        for i in 0..self.replicas {
            let virtual_key = format!("{}:{}", node, i);
            let hash = self.hash_key(&virtual_key);
            self.ring.insert(hash, node.to_string());
        }
        self.nodes.insert(node.to_string());
    }

    pub fn add_nodes(&mut self, nodes: &[String]) {
        for node in nodes {
            self.add_node(node);
        }
    }

    pub fn remove_node(&mut self, node: &str) {
        let _lock = self.mu.write().unwrap();
        for i in 0..self.replicas {
            let virtual_key = format!("{}:{}", node, i);
            let hash = self.hash_key(&virtual_key);
            self.ring.remove(&hash);
        }
        self.nodes.remove(node);
    }

    pub fn get_node(&self, key: &str) -> Result<String, String> {
        let _lock = self.mu.read().unwrap();
        if self.ring.is_empty() {
            return Err("no nodes in hash ring".to_string());
        }

        let hash = self.hash_key(key);

        let entry = self
            .ring
            .range(hash..)
            .next()
            .or_else(|| self.ring.iter().next());

        match entry {
            Some((_, node)) => Ok(node.clone()),
            None => Err("no nodes found".to_string()),
        }
    }

    pub fn get_nodes(&self) -> Vec<String> {
        let _lock = self.mu.read().unwrap();
        let mut nodes: Vec<String> = self.nodes.iter().cloned().collect();
        nodes.sort();
        nodes
    }

    pub fn node_count(&self) -> usize {
        let _lock = self.mu.read().unwrap();
        self.nodes.len()
    }

    pub fn replica_count(&self) -> usize {
        self.replicas
    }
}

impl std::fmt::Display for HashRing {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let nodes = self.get_nodes();
        writeln!(
            f,
            "HashRing[nodes={}, replicas={}]",
            nodes.len(),
            self.replicas
        )?;
        for node in nodes {
            writeln!(f, "  - {}", node)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_node() {
        let mut ring = HashRing::new(10);
        ring.add_node("node1");
        ring.add_node("node2");
        ring.add_node("node3");
        assert_eq!(ring.node_count(), 3);
    }

    #[test]
    fn test_remove_node() {
        let mut ring = HashRing::new(10);
        ring.add_node("node1");
        ring.add_node("node2");
        ring.add_node("node3");
        ring.remove_node("node2");
        assert_eq!(ring.node_count(), 2);
        let nodes = ring.get_nodes();
        assert!(!nodes.contains(&"node2".to_string()));
    }

    #[test]
    fn test_get_node_distribution() {
        let mut ring = HashRing::new(100);
        ring.add_node("node1");
        ring.add_node("node2");
        ring.add_node("node3");

        let test_keys = vec![
            "cpu", "memory", "disk", "network", "temperature", "pressure", "humidity",
        ];

        let mut node_counts: std::collections::HashMap<String, usize> =
            std::collections::HashMap::new();
        for key in test_keys {
            let node = ring.get_node(key).unwrap();
            *node_counts.entry(node).or_insert(0) += 1;
        }

        println!("Key distribution: {:?}", node_counts);
        assert!(node_counts.len() >= 2);
    }

    #[test]
    fn test_get_node_consistency() {
        let mut ring = HashRing::new(100);
        ring.add_node("node1");
        ring.add_node("node2");
        ring.add_node("node3");

        let test_keys = vec!["cpu", "memory", "disk"];
        for key in test_keys {
            let node1 = ring.get_node(key).unwrap();
            let node2 = ring.get_node(key).unwrap();
            assert_eq!(node1, node2);
        }
    }

    #[test]
    fn test_get_node_empty() {
        let ring = HashRing::new(10);
        let result = ring.get_node("cpu");
        assert!(result.is_err());
    }

    #[test]
    fn test_minimal_impact() {
        let mut ring = HashRing::new(100);
        ring.add_node("node1");
        ring.add_node("node2");
        ring.add_node("node3");

        let mut test_keys = Vec::with_capacity(100);
        for i in 0..100 {
            let key = format!(
                "{}{}{}",
                (b'a' + (i % 26) as u8) as char,
                (b'a' + ((i + 1) % 26) as u8) as char,
                (b'a' + ((i + 2) % 26) as u8) as char
            );
            test_keys.push(key);
        }

        let mut original_mapping = std::collections::HashMap::new();
        for key in &test_keys {
            original_mapping.insert(key.clone(), ring.get_node(key).unwrap());
        }

        ring.add_node("node4");

        let mut moved = 0;
        for key in &test_keys {
            let node = ring.get_node(key).unwrap();
            if original_mapping[key] != node {
                moved += 1;
            }
        }

        let move_percent = (moved as f64 / test_keys.len() as f64) * 100.0;
        println!(
            "Keys moved after adding node4: {}/{} ({:.1}%)",
            moved,
            test_keys.len(),
            move_percent
        );
        assert!(move_percent < 40.0, "Too many keys moved: {:.1}%", move_percent);
    }
}
