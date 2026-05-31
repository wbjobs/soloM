use crossbeam_skiplist::SkipMap;
use parking_lot::Mutex;
use std::sync::Arc;
use common::{SeriesKey, Value};

pub struct MemTable {
    data: SkipMap<(Vec<u8>, String, i64), Value>,
    size: Mutex<usize>,
}

impl MemTable {
    pub fn new() -> Self {
        MemTable {
            data: SkipMap::new(),
            size: Mutex::new(0),
        }
    }

    pub fn insert(&self, series_key: &SeriesKey, field: &str, timestamp: i64, value: Value) {
        let key = (series_key.to_bytes(), field.to_string(), timestamp);
        let value_size = std::mem::size_of::<Value>() + field.len() + key.0.len();

        self.data.insert(key, value);

        let mut size = self.size.lock();
        *size += value_size;
    }

    pub fn get(&self, series_key: &SeriesKey, field: &str, timestamp: i64) -> Option<Value> {
        let key = (series_key.to_bytes(), field.to_string(), timestamp);
        self.data.get(&key).map(|entry| entry.value().clone())
    }

    pub fn range(
        &self,
        series_key: &SeriesKey,
        field: &str,
        start: i64,
        end: i64,
    ) -> Vec<(i64, Value)> {
        let series_bytes = series_key.to_bytes();
        let field_str = field.to_string();

        let start_key = (series_bytes.clone(), field_str.clone(), start);
        let end_key = (series_bytes, field_str, end);

        let mut result = Vec::new();

        for entry in self.data.range(start_key..=end_key) {
            let key = entry.key();
            let value = entry.value();
            result.push((key.2, value.clone()));
        }

        result
    }

    pub fn iter(&self) -> impl Iterator<Item = ((Vec<u8>, String, i64), Value)> + '_ {
        self.data.iter().map(|entry| {
            (entry.key().clone(), entry.value().clone())
        })
    }

    pub fn into_entries(self) -> Vec<((Vec<u8>, String, i64), Value)> {
        self.data
            .into_iter()
            .map(|(key, value)| (key, value))
            .collect()
    }

    pub fn size(&self) -> usize {
        *self.size.lock()
    }

    pub fn len(&self) -> usize {
        self.data.len()
    }

    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    pub fn insert_raw(&self, key: (Vec<u8>, String, i64), value: Value) {
        self.data.insert(key, value);
    }
}

impl Default for MemTable {
    fn default() -> Self {
        Self::new()
    }
}

pub struct MemTableBuffer {
    active: parking_lot::Mutex<Arc<MemTable>>,
    immutable: parking_lot::Mutex<Option<Arc<MemTable>>>,
    threshold: usize,
}

impl MemTableBuffer {
    pub fn new(threshold: usize) -> Self {
        MemTableBuffer {
            active: parking_lot::Mutex::new(Arc::new(MemTable::new())),
            immutable: parking_lot::Mutex::new(None),
            threshold,
        }
    }

    pub fn insert(&self, series_key: &SeriesKey, field: &str, timestamp: i64, value: Value) -> bool {
        let active = self.active.lock();
        active.insert(series_key, field, timestamp, value);
        active.size() >= self.threshold
    }

    pub fn get(&self, series_key: &SeriesKey, field: &str, timestamp: i64) -> Option<Value> {
        {
            let active = self.active.lock();
            if let Some(value) = active.get(series_key, field, timestamp) {
                return Some(value);
            }
        }
        let guard = self.immutable.lock();
        guard.as_ref().and_then(|mt| mt.get(series_key, field, timestamp))
    }

    pub fn range(
        &self,
        series_key: &SeriesKey,
        field: &str,
        start: i64,
        end: i64,
    ) -> Vec<(i64, Value)> {
        let mut result = {
            let active = self.active.lock();
            active.range(series_key, field, start, end)
        };

        let guard = self.immutable.lock();
        if let Some(mt) = guard.as_ref() {
            result.extend(mt.range(series_key, field, start, end));
        }

        result.sort_by_key(|(ts, _)| *ts);
        result.dedup_by_key(|(ts, _)| *ts);
        result
    }

    pub fn freeze(&self) -> Option<Arc<MemTable>> {
        let mut active_guard = self.active.lock();
        let mut immutable_guard = self.immutable.lock();

        if immutable_guard.is_some() {
            return None;
        }

        let frozen = std::mem::replace(&mut *active_guard, Arc::new(MemTable::new()));
        *immutable_guard = Some(frozen);
        immutable_guard.clone()
    }

    pub fn clear_immutable(&self) {
        let mut guard = self.immutable.lock();
        *guard = None;
    }

    pub fn active_size(&self) -> usize {
        self.active.lock().size()
    }

    pub fn has_immutable(&self) -> bool {
        self.immutable.lock().is_some()
    }

    pub fn active(&self) -> Arc<MemTable> {
        self.active.lock().clone()
    }

    pub fn immutable(&self) -> Option<Arc<MemTable>> {
        self.immutable.lock().clone()
    }

    pub fn insert_raw(&self, key: (Vec<u8>, String, i64), value: Value) {
        self.active.lock().insert_raw(key, value);
    }
}
