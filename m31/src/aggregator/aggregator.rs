use crate::config::{AggregationConfig, AggregationMethod};
use crate::protocol::types::{Field, FieldValue, Point};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tokio::time;

type WindowKey = (String, String, u64);

struct FieldAccumulator {
    sum: f64,
    min: f64,
    max: f64,
    count: u64,
    integer_sum: i64,
    is_integer: bool,
}

impl FieldAccumulator {
    fn new() -> Self {
        Self {
            sum: 0.0,
            min: f64::MAX,
            max: f64::MIN,
            count: 0,
            integer_sum: 0,
            is_integer: true,
        }
    }

    fn add(&mut self, value: &FieldValue) {
        match value {
            FieldValue::Float(v) => {
                self.sum += v;
                self.min = self.min.min(*v);
                self.max = self.max.max(*v);
                self.count += 1;
                self.is_integer = false;
            }
            FieldValue::Integer(v) => {
                self.sum += *v as f64;
                self.min = self.min.min(*v as f64);
                self.max = self.max.max(*v as f64);
                self.count += 1;
                self.integer_sum += v;
            }
            _ => {}
        }
    }

    fn aggregate(&self, method: &AggregationMethod) -> Option<FieldValue> {
        if self.count == 0 {
            return None;
        }

        let value = match method {
            AggregationMethod::Avg => self.sum / self.count as f64,
            AggregationMethod::Min => self.min,
            AggregationMethod::Max => self.max,
            AggregationMethod::Sum => self.sum,
        };

        if self.is_integer && matches!(method, AggregationMethod::Sum) {
            Some(FieldValue::Integer(self.integer_sum))
        } else {
            Some(FieldValue::Float(value))
        }
    }
}

struct WindowBuffer {
    accumulators: HashMap<String, FieldAccumulator>,
    tags: HashMap<String, String>,
    field_keys: Vec<String>,
}

impl WindowBuffer {
    fn new() -> Self {
        Self {
            accumulators: HashMap::new(),
            tags: HashMap::new(),
            field_keys: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AggregatorStats {
    pub total_input_points: u64,
    pub total_output_points: u64,
    pub active_windows: usize,
    pub total_flushes: u64,
}

struct AggregatorInner {
    windows: RwLock<HashMap<WindowKey, WindowBuffer>>,
    config: AggregationConfig,
    total_input_points: AtomicU64,
    total_output_points: AtomicU64,
    total_flushes: AtomicU64,
    flush_handle: Mutex<Option<JoinHandle<()>>>,
    shutdown: tokio::sync::broadcast::Sender<()>,
}

use tokio::sync::Mutex;

pub struct Aggregator {
    inner: Arc<AggregatorInner>,
}

impl Aggregator {
    pub fn new(config: AggregationConfig) -> Self {
        let (shutdown_tx, _) = tokio::sync::broadcast::channel::<()>(1);

        let inner = Arc::new(AggregatorInner {
            windows: RwLock::new(HashMap::new()),
            config,
            total_input_points: AtomicU64::new(0),
            total_output_points: AtomicU64::new(0),
            total_flushes: AtomicU64::new(0),
            flush_handle: Mutex::new(None),
            shutdown: shutdown_tx,
        });

        let agg = Aggregator { inner };

        if agg.inner.config.enabled {
            agg.start_flush_task();
        }

        agg
    }

    fn start_flush_task(&self) {
        let inner = self.inner.clone();
        let mut shutdown_rx = inner.shutdown.subscribe();

        let handle = tokio::spawn(async move {
            let flush_interval = Duration::from_secs(inner.config.flush_interval_secs);
            let mut interval = time::interval(flush_interval);

            loop {
                tokio::select! {
                    _ = shutdown_rx.recv() => {
                        break;
                    }
                    _ = interval.tick() => {
                        let _ = Self::flush_expired_windows(&inner).await;
                    }
                }
            }
        });

        let inner = self.inner.clone();
        tokio::spawn(async move {
            let mut flush_handle = inner.flush_handle.lock().await;
            *flush_handle = Some(handle);
        });
    }

    pub async fn ingest(&self, points: &[Point], direct_points: &mut Vec<Point>, _aggregated_points: &mut Vec<Point>) {
        if !self.inner.config.enabled {
            direct_points.extend_from_slice(points);
            return;
        }

        let now = SystemTime::now();
        let threshold = Duration::from_secs(self.inner.config.threshold_secs);
        let interval_secs = self.inner.config.interval_secs;

        for point in points {
            self.inner.total_input_points.fetch_add(1, Ordering::SeqCst);

            let point_age = now.duration_since(point.timestamp).unwrap_or_default();

            if point_age >= threshold {
                let window_ts = Self::truncate_timestamp(&point.timestamp, interval_secs);
                let series_key = Self::series_key(point);
                let window_key = (point.measurement.clone(), series_key, window_ts);

                let mut windows = self.inner.windows.write().await;
                let buffer = windows.entry(window_key).or_insert_with(WindowBuffer::new);

                if buffer.tags.is_empty() {
                    buffer.tags = point.tags.clone();
                }

                for field in &point.fields {
                    let acc = buffer.accumulators.entry(field.key.clone()).or_insert_with(FieldAccumulator::new);
                    acc.add(&field.value);

                    if !buffer.field_keys.contains(&field.key) {
                        buffer.field_keys.push(field.key.clone());
                    }
                }
            } else {
                direct_points.push(point.clone());
            }
        }
    }

    fn truncate_timestamp(ts: &SystemTime, interval_secs: u64) -> u64 {
        let secs = ts.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
        (secs / interval_secs) * interval_secs
    }

    fn series_key(point: &Point) -> String {
        let mut parts: Vec<(&String, &String)> = point.tags.iter().collect();
        parts.sort_by_key(|(k, _)| *k);
        parts
            .iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect::<Vec<_>>()
            .join(",")
    }

    async fn flush_expired_windows(inner: &Arc<AggregatorInner>) -> Result<Vec<Point>, String> {
        let now = SystemTime::now();
        let interval_secs = inner.config.interval_secs;
        let method = &inner.config.method;

        let current_window = Self::truncate_timestamp(&now, interval_secs);

        let mut windows = inner.windows.write().await;
        let mut expired_keys = Vec::new();
        let mut aggregated = Vec::new();

        for (key, _) in windows.iter() {
            let (_, _, window_ts) = key;
            if *window_ts < current_window {
                expired_keys.push(key.clone());
            }
        }

        for key in expired_keys {
            if let Some(buffer) = windows.remove(&key) {
                let (measurement, _series, window_ts) = &key;

                let ts = UNIX_EPOCH + Duration::from_secs(*window_ts);

                let mut fields = Vec::new();
                for field_key in &buffer.field_keys {
                    if let Some(acc) = buffer.accumulators.get(field_key) {
                        if let Some(value) = acc.aggregate(method) {
                            fields.push(Field {
                                key: field_key.clone(),
                                value,
                            });
                        }
                    }
                }

                if !fields.is_empty() {
                    let raw_line = Self::format_line(measurement, &buffer.tags, &fields, &ts);

                    aggregated.push(Point {
                        measurement: measurement.clone(),
                        tags: buffer.tags.clone(),
                        fields,
                        timestamp: ts,
                        raw_line,
                    });
                }
            }
        }

        inner.total_output_points.fetch_add(aggregated.len() as u64, Ordering::SeqCst);
        inner.total_flushes.fetch_add(1, Ordering::SeqCst);

        Ok(aggregated)
    }

    pub async fn flush_all(&self) -> Result<Vec<Point>, String> {
        Self::flush_all_windows(&self.inner).await
    }

    async fn flush_all_windows(inner: &Arc<AggregatorInner>) -> Result<Vec<Point>, String> {
        let method = &inner.config.method;
        let mut windows = inner.windows.write().await;
        let mut aggregated = Vec::new();

        for (key, buffer) in windows.drain() {
            let (measurement, _series, window_ts) = &key;
            let ts = UNIX_EPOCH + Duration::from_secs(*window_ts);

            let mut fields = Vec::new();
            for field_key in &buffer.field_keys {
                if let Some(acc) = buffer.accumulators.get(field_key) {
                    if let Some(value) = acc.aggregate(method) {
                        fields.push(Field {
                            key: field_key.clone(),
                            value,
                        });
                    }
                }
            }

            if !fields.is_empty() {
                let raw_line = Self::format_line(measurement, &buffer.tags, &fields, &ts);

                aggregated.push(Point {
                    measurement: measurement.clone(),
                    tags: buffer.tags.clone(),
                    fields,
                    timestamp: ts,
                    raw_line,
                });
            }
        }

        inner.total_output_points.fetch_add(aggregated.len() as u64, Ordering::SeqCst);
        inner.total_flushes.fetch_add(1, Ordering::SeqCst);

        Ok(aggregated)
    }

    fn format_line(
        measurement: &str,
        tags: &HashMap<String, String>,
        fields: &[Field],
        ts: &SystemTime,
    ) -> String {
        let mut parts = Vec::new();

        parts.push(measurement.to_string());

        if !tags.is_empty() {
            let mut tag_parts: Vec<String> = tags
                .iter()
                .map(|(k, v)| format!("{}={}", k, v))
                .collect();
            tag_parts.sort();
            parts.push(",".to_string());
            parts.push(tag_parts.join(","));
        }

        parts.push(" ".to_string());

        let field_parts: Vec<String> = fields
            .iter()
            .map(|f| format!("{}={}", f.key, f.value))
            .collect();
        parts.push(field_parts.join(","));

        let ts_nanos = ts.duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
        parts.push(format!(" {}", ts_nanos));

        parts.join("")
    }

    pub fn stats(&self) -> AggregatorStats {
        let active_windows = match self.inner.windows.try_read() {
            Ok(w) => w.len(),
            Err(_) => 0,
        };

        AggregatorStats {
            total_input_points: self.inner.total_input_points.load(Ordering::SeqCst),
            total_output_points: self.inner.total_output_points.load(Ordering::SeqCst),
            active_windows: active_windows,
            total_flushes: self.inner.total_flushes.load(Ordering::SeqCst),
        }
    }

    pub async fn close(&self) {
        let _ = self.inner.shutdown.send(());

        let mut handle_guard = self.inner.flush_handle.lock().await;
        if let Some(handle) = handle_guard.take() {
            handle.abort();
            let _ = handle.await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn create_point(measurement: &str, tags: HashMap<String, String>, field_key: &str, field_value: f64, age_secs: u64) -> Point {
        let ts = SystemTime::now() - Duration::from_secs(age_secs);
        Point {
            measurement: measurement.to_string(),
            tags,
            fields: vec![Field {
                key: field_key.to_string(),
                value: FieldValue::Float(field_value),
            }],
            timestamp: ts,
            raw_line: format!("{} {}={}", measurement, field_key, field_value),
        }
    }

    fn create_int_point(measurement: &str, field_key: &str, field_value: i64, age_secs: u64) -> Point {
        let ts = SystemTime::now() - Duration::from_secs(age_secs);
        Point {
            measurement: measurement.to_string(),
            tags: HashMap::new(),
            fields: vec![Field {
                key: field_key.to_string(),
                value: FieldValue::Integer(field_value),
            }],
            timestamp: ts,
            raw_line: format!("{} {}={}i", measurement, field_key, field_value),
        }
    }

    #[tokio::test]
    async fn test_aggregation_disabled() {
        let config = AggregationConfig {
            enabled: false,
            ..Default::default()
        };
        let agg = Aggregator::new(config);

        let points = vec![create_point("cpu", HashMap::new(), "value", 1.0, 0)];
        let mut direct = Vec::new();
        let mut aggregated = Vec::new();

        agg.ingest(&points, &mut direct, &mut aggregated).await;

        assert_eq!(direct.len(), 1);
        assert_eq!(aggregated.len(), 0);

        agg.close().await;
    }

    #[tokio::test]
    async fn test_recent_data_passes_through() {
        let config = AggregationConfig {
            enabled: true,
            threshold_secs: 60,
            interval_secs: 10,
            method: AggregationMethod::Avg,
            flush_interval_secs: 5,
        };
        let agg = Aggregator::new(config);

        let points = vec![create_point("cpu", HashMap::new(), "value", 1.0, 5)];
        let mut direct = Vec::new();
        let mut aggregated = Vec::new();

        agg.ingest(&points, &mut direct, &mut aggregated).await;

        assert_eq!(direct.len(), 1);

        agg.close().await;
    }

    #[tokio::test]
    async fn test_old_data_buffered() {
        let config = AggregationConfig {
            enabled: true,
            threshold_secs: 60,
            interval_secs: 10,
            method: AggregationMethod::Avg,
            flush_interval_secs: 5,
        };
        let agg = Aggregator::new(config);

        let points = vec![create_point("cpu", HashMap::new(), "value", 1.0, 120)];
        let mut direct = Vec::new();
        let mut aggregated = Vec::new();

        agg.ingest(&points, &mut direct, &mut aggregated).await;

        assert_eq!(direct.len(), 0);

        let stats = agg.stats();
        assert_eq!(stats.total_input_points, 1);
        assert!(stats.active_windows >= 1);

        agg.close().await;
    }

    #[tokio::test]
    async fn test_avg_aggregation() {
        let config = AggregationConfig {
            enabled: true,
            threshold_secs: 60,
            interval_secs: 10,
            method: AggregationMethod::Avg,
            flush_interval_secs: 5,
        };
        let agg = Aggregator::new(config);

        let points = vec![
            create_point("cpu", HashMap::new(), "value", 10.0, 120),
            create_point("cpu", HashMap::new(), "value", 20.0, 115),
            create_point("cpu", HashMap::new(), "value", 30.0, 110),
        ];

        let mut direct = Vec::new();
        let mut aggregated = Vec::new();
        agg.ingest(&points, &mut direct, &mut aggregated).await;

        let result = agg.flush_all().await.unwrap();
        assert_eq!(result.len(), 1);

        let p = &result[0];
        assert_eq!(p.measurement, "cpu");
        assert_eq!(p.fields.len(), 1);

        match p.fields[0].value {
            FieldValue::Float(v) => {
                assert!((v - 20.0).abs() < 0.001);
            }
            _ => panic!("expected float value"),
        }

        agg.close().await;
    }

    #[tokio::test]
    async fn test_sum_aggregation_integer() {
        let config = AggregationConfig {
            enabled: true,
            threshold_secs: 60,
            interval_secs: 10,
            method: AggregationMethod::Sum,
            flush_interval_secs: 5,
        };
        let agg = Aggregator::new(config);

        let points = vec![
            create_int_point("cpu", "count", 10, 120),
            create_int_point("cpu", "count", 20, 115),
            create_int_point("cpu", "count", 30, 110),
        ];

        let mut direct = Vec::new();
        let mut aggregated = Vec::new();
        agg.ingest(&points, &mut direct, &mut aggregated).await;

        let result = agg.flush_all().await.unwrap();
        assert_eq!(result.len(), 1);

        match result[0].fields[0].value {
            FieldValue::Integer(v) => assert_eq!(v, 60),
            _ => panic!("expected integer value"),
        }

        agg.close().await;
    }

    #[tokio::test]
    async fn test_min_max_aggregation() {
        let config_min = AggregationConfig {
            enabled: true,
            threshold_secs: 60,
            interval_secs: 10,
            method: AggregationMethod::Min,
            flush_interval_secs: 5,
        };
        let agg_min = Aggregator::new(config_min);

        let points = vec![
            create_point("cpu", HashMap::new(), "value", 10.0, 120),
            create_point("cpu", HashMap::new(), "value", 5.0, 115),
            create_point("cpu", HashMap::new(), "value", 30.0, 110),
        ];

        let mut direct = Vec::new();
        let mut aggregated = Vec::new();
        agg_min.ingest(&points, &mut direct, &mut aggregated).await;

        let result = agg_min.flush_all().await.unwrap();
        match result[0].fields[0].value {
            FieldValue::Float(v) => assert!((v - 5.0).abs() < 0.001),
            _ => panic!("expected float"),
        }
        agg_min.close().await;

        let config_max = AggregationConfig {
            enabled: true,
            threshold_secs: 60,
            interval_secs: 10,
            method: AggregationMethod::Max,
            flush_interval_secs: 5,
        };
        let agg_max = Aggregator::new(config_max);

        let mut direct = Vec::new();
        let mut aggregated = Vec::new();
        agg_max.ingest(&points, &mut direct, &mut aggregated).await;

        let result = agg_max.flush_all().await.unwrap();
        match result[0].fields[0].value {
            FieldValue::Float(v) => assert!((v - 30.0).abs() < 0.001),
            _ => panic!("expected float"),
        }
        agg_max.close().await;
    }

    #[tokio::test]
    async fn test_different_series_separate_windows() {
        let config = AggregationConfig {
            enabled: true,
            threshold_secs: 60,
            interval_secs: 10,
            method: AggregationMethod::Avg,
            flush_interval_secs: 5,
        };
        let agg = Aggregator::new(config);

        let mut tags1 = HashMap::new();
        tags1.insert("host".to_string(), "server1".to_string());

        let mut tags2 = HashMap::new();
        tags2.insert("host".to_string(), "server2".to_string());

        let points = vec![
            create_point("cpu", tags1, "value", 10.0, 120),
            create_point("cpu", tags2, "value", 20.0, 120),
        ];

        let mut direct = Vec::new();
        let mut aggregated = Vec::new();
        agg.ingest(&points, &mut direct, &mut aggregated).await;

        let result = agg.flush_all().await.unwrap();
        assert_eq!(result.len(), 2);

        agg.close().await;
    }

    #[tokio::test]
    async fn test_multiple_fields() {
        let config = AggregationConfig {
            enabled: true,
            threshold_secs: 60,
            interval_secs: 10,
            method: AggregationMethod::Avg,
            flush_interval_secs: 5,
        };
        let agg = Aggregator::new(config);

        let ts = SystemTime::now() - Duration::from_secs(120);
        let points = vec![
            Point {
                measurement: "cpu".to_string(),
                tags: HashMap::new(),
                fields: vec![
                    Field { key: "usage".to_string(), value: FieldValue::Float(50.0) },
                    Field { key: "idle".to_string(), value: FieldValue::Float(50.0) },
                ],
                timestamp: ts,
                raw_line: "cpu usage=50.0,idle=50.0".to_string(),
            },
            Point {
                measurement: "cpu".to_string(),
                tags: HashMap::new(),
                fields: vec![
                    Field { key: "usage".to_string(), value: FieldValue::Float(70.0) },
                    Field { key: "idle".to_string(), value: FieldValue::Float(30.0) },
                ],
                timestamp: ts,
                raw_line: "cpu usage=70.0,idle=30.0".to_string(),
            },
        ];

        let mut direct = Vec::new();
        let mut aggregated = Vec::new();
        agg.ingest(&points, &mut direct, &mut aggregated).await;

        let result = agg.flush_all().await.unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].fields.len(), 2);

        agg.close().await;
    }
}
