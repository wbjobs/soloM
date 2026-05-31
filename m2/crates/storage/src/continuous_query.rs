use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration as StdDuration;
use parking_lot::Mutex;
use tokio::time::interval;
use tracing::{info, warn, error};
use common::{
    ContinuousQueryDefinition, ContinuousQueryStatus, CQResult,
    AggregateType, DataPoint, Value, Result,
};
use crate::ts_engine::TimeSeriesEngine;

struct CQRuntimeState {
    last_run: Option<i64>,
    run_count: u64,
    error_count: u64,
    last_error: Option<String>,
}

impl CQRuntimeState {
    fn new() -> Self {
        CQRuntimeState {
            last_run: None,
            run_count: 0,
            error_count: 0,
            last_error: None,
        }
    }
}

pub struct ContinuousQueryManager {
    engine: TimeSeriesEngine,
    definitions: Arc<Mutex<HashMap<String, ContinuousQueryDefinition>>>,
    runtime_states: Arc<Mutex<HashMap<String, CQRuntimeState>>>,
    persist_path: String,
}

impl ContinuousQueryManager {
    pub fn new(engine: TimeSeriesEngine, data_path: &Path) -> Result<Self> {
        let persist_path = data_path.join("cq_definitions.bin").to_string_lossy().to_string();
        let definitions = Self::load_definitions(&persist_path).unwrap_or_default();
        let runtime_states = definitions
            .keys()
            .map(|k| (k.clone(), CQRuntimeState::new()))
            .collect();

        Ok(ContinuousQueryManager {
            engine,
            definitions: Arc::new(Mutex::new(definitions)),
            runtime_states: Arc::new(Mutex::new(runtime_states)),
            persist_path,
        })
    }

    fn load_definitions(path: &str) -> Option<HashMap<String, ContinuousQueryDefinition>> {
        match std::fs::read(path) {
            Ok(data) => {
                match bincode::deserialize::<HashMap<String, ContinuousQueryDefinition>>(&data) {
                    Ok(defs) => Some(defs),
                    Err(e) => {
                        warn!("Failed to deserialize CQ definitions: {}", e);
                        None
                    }
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => {
                warn!("Failed to load CQ definitions: {}", e);
                None
            }
        }
    }

    fn save_definitions(&self) -> Result<()> {
        let definitions = self.definitions.lock();
        let data = bincode::serialize(&*definitions)?;
        std::fs::write(&self.persist_path, data)?;
        Ok(())
    }

    pub fn register_query(&self, definition: ContinuousQueryDefinition) -> Result<()> {
        let name = definition.name.clone();
        {
            let mut definitions = self.definitions.lock();
            if definitions.contains_key(&name) {
                return Err(common::TsdbError::InvalidArgument(
                    format!("Continuous query '{}' already exists", name)
                ));
            }
            definitions.insert(name.clone(), definition);
        }
        {
            let mut states = self.runtime_states.lock();
            states.insert(name, CQRuntimeState::new());
        }
        self.save_definitions()?;
        Ok(())
    }

    pub fn unregister_query(&self, name: &str) -> Result<bool> {
        let removed = {
            let mut definitions = self.definitions.lock();
            definitions.remove(name).is_some()
        };
        {
            let mut states = self.runtime_states.lock();
            states.remove(name);
        }
        if removed {
            self.save_definitions()?;
        }
        Ok(removed)
    }

    pub fn enable_query(&self, name: &str) -> Result<bool> {
        let mut definitions = self.definitions.lock();
        if let Some(def) = definitions.get_mut(name) {
            def.enabled = true;
            self.save_definitions()?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn disable_query(&self, name: &str) -> Result<bool> {
        let mut definitions = self.definitions.lock();
        if let Some(def) = definitions.get_mut(name) {
            def.enabled = false;
            self.save_definitions()?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn list_queries(&self) -> Vec<ContinuousQueryDefinition> {
        let definitions = self.definitions.lock();
        definitions.values().cloned().collect()
    }

    pub fn get_query_status(&self, name: &str) -> Option<ContinuousQueryStatus> {
        let definitions = self.definitions.lock();
        let states = self.runtime_states.lock();

        let def = definitions.get(name)?;
        let state = states.get(name)?;

        let next_run = if def.enabled {
            state.last_run.map(|last| last + def.interval.to_millis())
        } else {
            None
        };

        Some(ContinuousQueryStatus {
            name: name.to_string(),
            enabled: def.enabled,
            last_run: state.last_run,
            next_run,
            run_count: state.run_count,
            error_count: state.error_count,
            last_error: state.last_error.clone(),
        })
    }

    pub fn get_all_statuses(&self) -> Vec<ContinuousQueryStatus> {
        let definitions = self.definitions.lock();
        definitions
            .keys()
            .filter_map(|name| self.get_query_status(name))
            .collect()
    }

    pub async fn start(self: Arc<Self>) {
        info!("Starting continuous query manager");
        let mut ticker = interval(StdDuration::from_secs(1));

        loop {
            ticker.tick().await;
            self.check_and_run().await;
        }
    }

    async fn check_and_run(&self) {
        let now = chrono::Utc::now().timestamp_millis();
        let queries_to_run: Vec<ContinuousQueryDefinition> = {
            let definitions = self.definitions.lock();
            let states = self.runtime_states.lock();

            definitions
                .values()
                .filter(|def| def.enabled)
                .filter(|def| {
                    states.get(&def.name)
                        .and_then(|s| s.last_run)
                        .map(|last| now - last >= def.interval.to_millis())
                        .unwrap_or(true)
                })
                .cloned()
                .collect()
        };

        for def in queries_to_run {
            self.execute_query(&def, now).await;
        }
    }

    async fn execute_query(&self, def: &ContinuousQueryDefinition, run_time: i64) {
        let interval_ms = def.interval.to_millis();
        let window_end = (run_time / interval_ms) * interval_ms;
        let window_start = window_end - interval_ms;

        info!(
            "Executing CQ '{}': {} - {} ({}ms window)",
            def.name, window_start, window_end, interval_ms
        );

        let result = self.run_aggregation(def, window_start, window_end);

        let mut states = self.runtime_states.lock();
        if let Some(state) = states.get_mut(&def.name) {
            state.last_run = Some(run_time);
            state.run_count += 1;

            match result {
                Ok(results) => {
                    if let Err(e) = self.write_results(def, window_start, window_end, &results) {
                        state.error_count += 1;
                        state.last_error = Some(e.to_string());
                        error!("Failed to write CQ results for '{}': {}", def.name, e);
                    } else {
                        state.last_error = None;
                        info!(
                            "CQ '{}' completed successfully, wrote {} results",
                            def.name, results.len()
                        );
                    }
                }
                Err(e) => {
                    state.error_count += 1;
                    state.last_error = Some(e.to_string());
                    error!("CQ '{}' execution failed: {}", def.name, e);
                }
            }
        }
    }

    fn run_aggregation(
        &self,
        def: &ContinuousQueryDefinition,
        window_start: i64,
        window_end: i64,
    ) -> Result<Vec<CQResult>> {
        let query_results = self.engine.query_range(
            &def.source_measurement,
            None,
            &def.field,
            window_start,
            window_end,
        )?;

        let mut results = Vec::new();

        for (series_key, data_points) in query_results {
            if data_points.is_empty() {
                continue;
            }

            let value = self.apply_aggregate(def.aggregate, &data_points);
            let tags = if def.tags.is_empty() {
                series_key.tags.iter().map(|(k, v)| (k.clone(), v.clone())).collect()
            } else {
                series_key.tags
                    .iter()
                    .filter(|(k, _)| def.tags.contains(k))
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect()
            };

            results.push(CQResult {
                window_start,
                window_end,
                tags,
                value,
            });
        }

        Ok(results)
    }

    fn apply_aggregate(&self, agg: AggregateType, data: &[(i64, Value)]) -> f64 {
        match agg {
            AggregateType::Mean => {
                let sum: f64 = data.iter().filter_map(|(_, v)| v.as_float()).sum();
                let count = data.iter().filter(|(_, v)| v.as_float().is_some()).count();
                if count > 0 { sum / count as f64 } else { 0.0 }
            }
            AggregateType::Sum => {
                data.iter().filter_map(|(_, v)| v.as_float()).sum()
            }
            AggregateType::Count => {
                data.len() as f64
            }
            AggregateType::Min => {
                data.iter()
                    .filter_map(|(_, v)| v.as_float())
                    .fold(f64::INFINITY, f64::min)
            }
            AggregateType::Max => {
                data.iter()
                    .filter_map(|(_, v)| v.as_float())
                    .fold(f64::NEG_INFINITY, f64::max)
            }
            AggregateType::First => {
                data.first().and_then(|(_, v)| v.as_float()).unwrap_or(0.0)
            }
            AggregateType::Last => {
                data.last().and_then(|(_, v)| v.as_float()).unwrap_or(0.0)
            }
        }
    }

    fn write_results(
        &self,
        def: &ContinuousQueryDefinition,
        window_start: i64,
        _window_end: i64,
        results: &[CQResult],
    ) -> Result<()> {
        let mut data_points = Vec::new();

        for result in results {
            let tags = result.tags.clone();
            let field_name = format!("{}_{}", def.aggregate, def.field);
            let fields = vec![(field_name, Value::Float(result.value))];

            data_points.push(DataPoint {
                measurement: def.target_measurement.clone(),
                tags,
                timestamp: window_start,
                fields,
            });
        }

        if !data_points.is_empty() {
            self.engine.write_batch(data_points)?;
        }

        Ok(())
    }
}
