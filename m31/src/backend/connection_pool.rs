use super::{BackendNode, MemoryCacheNode, NodeStats, WriteTask};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::error::Error;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime};
use tokio::sync::{broadcast, mpsc, Mutex, RwLock};
use tokio::task::JoinHandle;
use tokio::time;

const MAX_RETRY_COUNT: u32 = 3;
const RETRY_DELAY_MS: u64 = 100;
const NODE_HEALTH_CHECK_INTERVAL_MS: u64 = 5000;
const NODE_FAILURE_THRESHOLD: u32 = 5;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoolStats {
    pub queue_size: usize,
    pub queue_capacity: usize,
    pub worker_count: usize,
    pub async_success: i64,
    pub async_errors: i64,
    pub retry_count: u64,
    pub active_workers: usize,
}

#[derive(Debug, Clone)]
struct NodeHealth {
    is_healthy: bool,
    failure_count: u32,
    last_failure_time: Option<SystemTime>,
    last_success_time: Option<SystemTime>,
}

impl Default for NodeHealth {
    fn default() -> Self {
        Self {
            is_healthy: true,
            failure_count: 0,
            last_failure_time: None,
            last_success_time: None,
        }
    }
}

struct ConnectionPoolInner {
    nodes: RwLock<HashMap<String, Arc<dyn BackendNode>>>,
    node_health: RwLock<HashMap<String, NodeHealth>>,
    write_queue: mpsc::Sender<WriteTask>,
    closed: AtomicBool,
    async_errors: AtomicI64,
    async_success: AtomicI64,
    retry_count: AtomicU64,
    queue_capacity: usize,
    queue_size: Arc<std::sync::atomic::AtomicUsize>,
    workers: Mutex<Vec<JoinHandle<()>>>,
    shutdown_sender: broadcast::Sender<()>,
    health_check_handle: Mutex<Option<JoinHandle<()>>>,
}

pub struct ConnectionPool {
    inner: Arc<ConnectionPoolInner>,
}

impl ConnectionPool {
    pub async fn new(
        node_names: &[String],
        queue_size: usize,
        worker_count: usize,
    ) -> Result<Self, Box<dyn Error + Send + Sync>> {
        if node_names.is_empty() {
            return Err("no nodes provided".into());
        }

        let (tx, rx) = mpsc::channel::<WriteTask>(queue_size);
        let (shutdown_tx, _) = broadcast::channel::<()>(1);

        let inner = Arc::new(ConnectionPoolInner {
            nodes: RwLock::new(HashMap::new()),
            node_health: RwLock::new(HashMap::new()),
            write_queue: tx,
            closed: AtomicBool::new(false),
            async_errors: AtomicI64::new(0),
            async_success: AtomicI64::new(0),
            retry_count: AtomicU64::new(0),
            queue_capacity: queue_size,
            queue_size: Arc::new(std::sync::atomic::AtomicUsize::new(0)),
            workers: Mutex::new(Vec::new()),
            shutdown_sender: shutdown_tx,
            health_check_handle: Mutex::new(None),
        });

        {
            let mut nodes = inner.nodes.write().await;
            let mut health = inner.node_health.write().await;
            for name in node_names {
                let node = MemoryCacheNode::new(name.clone());
                nodes.insert(name.clone(), Arc::new(node));
                health.insert(name.clone(), NodeHealth::default());
            }
        }

        let pool = ConnectionPool { inner };
        pool.start_workers(rx, worker_count).await;
        pool.start_health_check();

        Ok(pool)
    }

    async fn start_workers(&self, rx: mpsc::Receiver<WriteTask>, worker_count: usize) {
        let mut workers = self.inner.workers.lock().await;
        let shared_rx = Arc::new(Mutex::new(rx));

        for id in 0..worker_count {
            let inner = self.inner.clone();
            let rx_clone = shared_rx.clone();
            let shutdown_rx = inner.shutdown_sender.subscribe();

            let handle = tokio::spawn(async move {
                Self::worker_loop(id, inner, rx_clone, shutdown_rx).await;
            });

            workers.push(handle);
        }
    }

    fn start_health_check(&self) {
        let inner = self.inner.clone();
        let handle = tokio::spawn(async move {
            Self::health_check_loop(inner).await;
        });

        let inner = self.inner.clone();
        tokio::spawn(async move {
            let mut health_handle = inner.health_check_handle.lock().await;
            *health_handle = Some(handle);
        });
    }

    async fn health_check_loop(inner: Arc<ConnectionPoolInner>) {
        let mut interval = time::interval(Duration::from_millis(NODE_HEALTH_CHECK_INTERVAL_MS));

        loop {
            if inner.closed.load(Ordering::SeqCst) {
                break;
            }

            interval.tick().await;

            let nodes = inner.nodes.read().await;
            let mut health = inner.node_health.write().await;

            for (name, node) in nodes.iter() {
                if let Some(node_health) = health.get_mut(name) {
                    if !node_health.is_healthy {
                        let test_points = vec![];
                        if node.write(&test_points).is_ok() {
                            node_health.is_healthy = true;
                            node_health.failure_count = 0;
                            node_health.last_success_time = Some(SystemTime::now());
                        }
                    }
                }
            }
        }
    }

    async fn worker_loop(
        _id: usize,
        pool: Arc<ConnectionPoolInner>,
        rx: Arc<Mutex<mpsc::Receiver<WriteTask>>>,
        mut shutdown_rx: broadcast::Receiver<()>,
    ) {
        loop {
            tokio::select! {
                _ = shutdown_rx.recv() => {
                    break;
                }
                task = Self::receive_task(&rx) => {
                    match task {
                        Some(task) => {
                            pool.queue_size.fetch_sub(1, Ordering::SeqCst);

                            if pool.closed.load(Ordering::SeqCst) {
                                break;
                            }

                            Self::process_task_with_retry(&pool, task).await;
                        }
                        None => {
                            break;
                        }
                    }
                }
            }
        }
    }

    async fn receive_task(rx: &Arc<Mutex<mpsc::Receiver<WriteTask>>>) -> Option<WriteTask> {
        let mut rx_guard = rx.lock().await;
        rx_guard.recv().await
    }

    async fn process_task_with_retry(pool: &Arc<ConnectionPoolInner>, task: WriteTask) {
        let mut retry_count = 0;

        loop {
            let is_healthy = {
                let health = pool.node_health.read().await;
                health
                    .get(&task.node_name)
                    .map(|h| h.is_healthy)
                    .unwrap_or(true)
            };

            if !is_healthy && retry_count >= MAX_RETRY_COUNT {
                pool.async_errors.fetch_add(1, Ordering::SeqCst);
                break;
            }

            let node = {
                let nodes = pool.nodes.read().await;
                nodes.get(&task.node_name).cloned()
            };

            match node {
                Some(node) => {
                    match node.write(&task.points) {
                        Ok(_) => {
                            pool.async_success.fetch_add(1, Ordering::SeqCst);

                            let mut health = pool.node_health.write().await;
                            if let Some(node_health) = health.get_mut(&task.node_name) {
                                node_health.last_success_time = Some(SystemTime::now());
                                node_health.failure_count = 0;
                                node_health.is_healthy = true;
                            }
                            break;
                        }
                        Err(_) => {
                            let mut health = pool.node_health.write().await;
                            if let Some(node_health) = health.get_mut(&task.node_name) {
                                node_health.failure_count += 1;
                                node_health.last_failure_time = Some(SystemTime::now());

                                if node_health.failure_count >= NODE_FAILURE_THRESHOLD {
                                    node_health.is_healthy = false;
                                }
                            }

                            if retry_count < MAX_RETRY_COUNT {
                                retry_count += 1;
                                pool.retry_count.fetch_add(1, Ordering::SeqCst);
                                time::sleep(Duration::from_millis(RETRY_DELAY_MS * retry_count as u64)).await;
                            } else {
                                pool.async_errors.fetch_add(1, Ordering::SeqCst);
                                break;
                            }
                        }
                    }
                }
                None => {
                    pool.async_errors.fetch_add(1, Ordering::SeqCst);
                    break;
                }
            }
        }
    }

    pub async fn get_node(
        &self,
        name: &str,
    ) -> Result<Arc<dyn BackendNode>, Box<dyn Error + Send + Sync>> {
        let nodes = self.inner.nodes.read().await;
        nodes
            .get(name)
            .cloned()
            .ok_or_else(|| format!("node {} not found", name).into())
    }

    pub async fn is_node_healthy(&self, name: &str) -> bool {
        let health = self.inner.node_health.read().await;
        health.get(name).map(|h| h.is_healthy).unwrap_or(false)
    }

    pub async fn get_healthy_nodes(&self) -> Vec<String> {
        let health = self.inner.node_health.read().await;
        health
            .iter()
            .filter(|(_, h)| h.is_healthy)
            .map(|(name, _)| name.clone())
            .collect()
    }

    pub async fn async_write(
        &self,
        task: WriteTask,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        if self.inner.closed.load(Ordering::SeqCst) {
            return Err("pool is closed".into());
        }

        let is_healthy = self.is_node_healthy(&task.node_name).await;
        if !is_healthy {
            return Err(format!("node {} is not healthy", task.node_name).into());
        }

        self.inner
            .write_queue
            .try_send(task)
            .map(|_| {
                self.inner.queue_size.fetch_add(1, Ordering::SeqCst);
            })
            .map_err(|e| {
                self.inner.async_errors.fetch_add(1, Ordering::SeqCst);
                format!("write queue error: {}", e).into()
            })
    }

    pub async fn sync_write(
        &self,
        task: &WriteTask,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        let is_healthy = self.is_node_healthy(&task.node_name).await;
        if !is_healthy {
            return Err(format!("node {} is not healthy", task.node_name).into());
        }

        let node = self.get_node(&task.node_name).await?;
        node.write(&task.points)
    }

    pub async fn get_all_nodes(&self) -> Vec<Arc<dyn BackendNode>> {
        let nodes = self.inner.nodes.read().await;
        nodes.values().cloned().collect()
    }

    pub async fn node_names(&self) -> Vec<String> {
        let nodes = self.inner.nodes.read().await;
        nodes.keys().cloned().collect()
    }

    pub async fn add_node(&self, node: MemoryCacheNode) {
        let name = node.name().to_string();
        let mut nodes = self.inner.nodes.write().await;
        let mut health = self.inner.node_health.write().await;
        nodes.insert(name.clone(), Arc::new(node));
        health.insert(name, NodeHealth::default());
    }

    pub async fn remove_node(&self, name: &str) {
        let mut nodes = self.inner.nodes.write().await;
        let mut health = self.inner.node_health.write().await;
        if let Some(node) = nodes.remove(name) {
            let _ = node.close();
        }
        health.remove(name);
    }

    pub async fn stats(&self) -> HashMap<String, NodeStats> {
        let nodes = self.inner.nodes.read().await;
        let mut result = HashMap::new();
        for (name, node) in nodes.iter() {
            result.insert(name.clone(), node.stats());
        }
        result
    }

    pub fn pool_stats(&self) -> PoolStats {
        PoolStats {
            queue_size: self.inner.queue_size.load(Ordering::SeqCst),
            queue_capacity: self.inner.queue_capacity,
            worker_count: self.inner.workers.try_lock().map(|w| w.len()).unwrap_or(0),
            async_success: self.inner.async_success.load(Ordering::SeqCst),
            async_errors: self.inner.async_errors.load(Ordering::SeqCst),
            retry_count: self.inner.retry_count.load(Ordering::SeqCst),
            active_workers: self.inner.workers.try_lock().map(|w| w.len()).unwrap_or(0),
        }
    }

    pub async fn wait_for_drain(&self, timeout: Duration) -> bool {
        let deadline = time::Instant::now() + timeout;
        while self.inner.queue_size.load(Ordering::SeqCst) > 0 && time::Instant::now() < deadline {
            time::sleep(Duration::from_millis(10)).await;
        }
        self.inner.queue_size.load(Ordering::SeqCst) == 0
    }

    pub async fn close(&self) -> Result<(), Box<dyn Error + Send + Sync>> {
        if self
            .inner
            .closed
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Ok(());
        }

        let _ = self.inner.shutdown_sender.send(());

        {
            let mut health_handle = self.inner.health_check_handle.lock().await;
            if let Some(handle) = health_handle.take() {
                handle.abort();
                let _ = handle.await;
            }
        }

        let mut workers = self.inner.workers.lock().await;
        for handle in workers.drain(..) {
            let _ = handle.await;
        }
        drop(workers);

        let nodes = self.inner.nodes.read().await;
        for node in nodes.values() {
            let _ = node.close();
        }

        Ok(())
    }
}

impl Drop for ConnectionPool {
    fn drop(&mut self) {
        if !self.inner.closed.load(Ordering::SeqCst) {
            let inner = self.inner.clone();
            tokio::spawn(async move {
                let _ = inner.shutdown_sender.send(());
                inner.closed.store(true, Ordering::SeqCst);
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::Point;
    use std::collections::HashMap;
    use std::time::SystemTime;

    fn create_test_point(measurement: &str) -> Point {
        Point {
            measurement: measurement.to_string(),
            tags: HashMap::new(),
            fields: vec![],
            timestamp: SystemTime::now(),
            raw_line: format!("{} value=1", measurement),
        }
    }

    #[tokio::test]
    async fn test_sync_write() {
        let nodes = vec![
            "node1".to_string(),
            "node2".to_string(),
            "node3".to_string(),
        ];
        let pool = ConnectionPool::new(&nodes, 100, 2).await.unwrap();

        let points = vec![create_test_point("cpu"), create_test_point("cpu")];

        let task = WriteTask {
            node_name: "node1".to_string(),
            points,
        };

        pool.sync_write(&task).await.unwrap();

        let node = pool.get_node("node1").await.unwrap();
        let stats = node.stats();
        assert_eq!(stats.total_points, 2);

        pool.close().await.unwrap();
    }

    #[tokio::test]
    async fn test_async_write() {
        let nodes = vec![
            "node1".to_string(),
            "node2".to_string(),
            "node3".to_string(),
        ];
        let pool = ConnectionPool::new(&nodes, 100, 2).await.unwrap();

        let points = vec![create_test_point("cpu"), create_test_point("memory")];

        let task = WriteTask {
            node_name: "node2".to_string(),
            points,
        };

        pool.async_write(task).await.unwrap();

        let drained = pool.wait_for_drain(Duration::from_secs(2)).await;
        assert!(drained, "Queue not drained within timeout");

        time::sleep(Duration::from_millis(100)).await;

        let node = pool.get_node("node2").await.unwrap();
        let stats = node.stats();
        assert_eq!(stats.total_points, 2);

        pool.close().await.unwrap();
    }

    #[tokio::test]
    async fn test_concurrent_writes() {
        let nodes = vec![
            "node1".to_string(),
            "node2".to_string(),
            "node3".to_string(),
        ];
        let pool = Arc::new(ConnectionPool::new(&nodes, 1000, 5).await.unwrap());

        let num_writes = 100;
        let mut handles = Vec::new();

        for i in 0..num_writes {
            let pool_clone = pool.clone();
            let node_name = nodes[i % 3].clone();
            let handle = tokio::spawn(async move {
                let points = vec![create_test_point("cpu"), create_test_point("memory")];
                let task = WriteTask {
                    node_name,
                    points,
                };
                let _ = pool_clone.async_write(task).await;
            });
            handles.push(handle);
        }

        for handle in handles {
            let _ = handle.await;
        }

        let drained = pool.wait_for_drain(Duration::from_secs(5)).await;
        assert!(drained, "Queue not drained within timeout");

        time::sleep(Duration::from_millis(200)).await;

        let mut total_points = 0i64;
        for node in pool.get_all_nodes().await {
            total_points += node.stats().total_points;
        }

        let expected_points = num_writes * 2;
        assert_eq!(total_points, expected_points as i64);

        pool.close().await.unwrap();
    }

    #[tokio::test]
    async fn test_graceful_shutdown() {
        let nodes = vec!["node1".to_string()];
        let pool = Arc::new(ConnectionPool::new(&nodes, 100, 3).await.unwrap());

        let pool_clone = pool.clone();
        let shutdown_handle = tokio::spawn(async move {
            time::sleep(Duration::from_millis(50)).await;
            pool_clone.close().await.unwrap();
        });

        let pool_clone = pool.clone();
        let write_handle = tokio::spawn(async move {
            for i in 0..10 {
                let points = vec![create_test_point(&format!("cpu_{}", i))];
                let task = WriteTask {
                    node_name: "node1".to_string(),
                    points,
                };
                let _ = pool_clone.async_write(task).await;
                time::sleep(Duration::from_millis(10)).await;
            }
        });

        let _ = shutdown_handle.await;
        let _ = write_handle.await;

        assert!(pool.inner.closed.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn test_node_health_check() {
        let nodes = vec!["node1".to_string(), "node2".to_string()];
        let pool = ConnectionPool::new(&nodes, 100, 2).await.unwrap();

        assert!(pool.is_node_healthy("node1").await);
        assert!(pool.is_node_healthy("node2").await);

        let healthy_nodes = pool.get_healthy_nodes().await;
        assert_eq!(healthy_nodes.len(), 2);

        pool.close().await.unwrap();
    }
}
