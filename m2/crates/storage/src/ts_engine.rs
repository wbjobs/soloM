use parking_lot::Mutex;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use common::{DataPoint, SeriesKey, Tags, Result, Value};
use crate::engine::StorageEngine;

#[derive(Clone)]
pub struct TimeSeriesEngine {
    storage: Arc<StorageEngine>,
    series_index: Arc<Mutex<HashMap<String, Vec<SeriesKey>>>>,
}

impl TimeSeriesEngine {
    pub fn new(path: &Path) -> Result<Self> {
        let storage = Arc::new(StorageEngine::new(path)?);
        let series_index = Arc::new(Mutex::new(HashMap::new()));

        Ok(TimeSeriesEngine {
            storage,
            series_index,
        })
    }

    pub fn write(&self, data_point: DataPoint) -> Result<()> {
        let series_key = {
            let mut sk = SeriesKey::new(data_point.measurement.clone());
            for (key, value) in &data_point.tags {
                sk = sk.with_tag(key.clone(), value.clone());
            }
            sk
        };

        for (field, value) in &data_point.fields {
            self.storage.insert(
                &series_key,
                field,
                data_point.timestamp,
                value.clone(),
            )?;
        }

        {
            let mut index = self.series_index.lock();
            let measurement_series = index
                .entry(data_point.measurement)
                .or_insert_with(Vec::new);

            if !measurement_series.contains(&series_key) {
                measurement_series.push(series_key);
            }
        }

        Ok(())
    }

    pub fn write_batch(&self, data_points: Vec<DataPoint>) -> Result<()> {
        if data_points.is_empty() {
            return Ok(());
        }

        let mut new_series: HashMap<String, Vec<SeriesKey>> = HashMap::new();

        for data_point in &data_points {
            let series_key = {
                let mut sk = SeriesKey::new(data_point.measurement.clone());
                for (key, value) in &data_point.tags {
                    sk = sk.with_tag(key.clone(), value.clone());
                }
                sk
            };

            for (field, value) in &data_point.fields {
                self.storage.insert(
                    &series_key,
                    field,
                    data_point.timestamp,
                    value.clone(),
                )?;
            }

            new_series
                .entry(data_point.measurement.clone())
                .or_insert_with(Vec::new)
                .push(series_key);
        }

        {
            let mut index = self.series_index.lock();
            for (measurement, series_keys) in new_series {
                let measurement_series = index
                    .entry(measurement)
                    .or_insert_with(Vec::new);

                for sk in series_keys {
                    if !measurement_series.contains(&sk) {
                        measurement_series.push(sk);
                    }
                }
            }
        }

        Ok(())
    }

    pub fn query_range(
        &self,
        measurement: &str,
        tags: Option<&Tags>,
        field: &str,
        start: i64,
        end: i64,
    ) -> Result<Vec<(SeriesKey, Vec<(i64, Value)>)>> {
        let series_list = {
            let index = self.series_index.lock();
            index.get(measurement).cloned().unwrap_or_default()
        };

        let mut result = Vec::new();

        for series_key in series_list {
            if let Some(filter_tags) = tags {
                let mut match_all = true;
                for (k, v) in filter_tags {
                    if series_key.tags.get(k) != Some(v) {
                        match_all = false;
                        break;
                    }
                }
                if !match_all {
                    continue;
                }
            }

            let data = self.storage.range(&series_key, field, start, end)?;
            if !data.is_empty() {
                result.push((series_key, data));
            }
        }

        Ok(result)
    }

    pub fn get_series_keys(&self, measurement: &str) -> Vec<SeriesKey> {
        let index = self.series_index.lock();
        index.get(measurement).cloned().unwrap_or_default()
    }

    pub fn list_measurements(&self) -> Vec<String> {
        let index = self.series_index.lock();
        index.keys().cloned().collect()
    }

    pub fn flush(&self) -> Result<()> {
        self.storage.flush()
    }
}
