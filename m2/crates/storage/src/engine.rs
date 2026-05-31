use arc_swap::ArcSwap;
use parking_lot::Mutex;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use common::{Result, SeriesKey, Value};
use crate::compaction::{CompactionTask, SharedLevelState, LevelState};
use crate::mem_table::MemTableBuffer;
use crate::sstable::SSTable;
use crate::wal::{WAL, WALEntry};

const MEMTABLE_THRESHOLD: usize = 1024 * 1024;
const COMPACTION_CHECK_INTERVAL: Duration = Duration::from_secs(5);

pub struct StorageEngine {
    path: PathBuf,
    memtables: Arc<MemTableBuffer>,
    levels: SharedLevelState,
    wal: Mutex<WAL>,
    compaction: CompactionTask,
    shutdown: crossbeam_channel::Sender<()>,
}

impl StorageEngine {
    pub fn new(path: &Path) -> Result<Self> {
        std::fs::create_dir_all(path)?;

        let wal_path = path.join("wal").join("current.log");
        let wal = WAL::new(&wal_path)?;

        let level_state = Self::load_sstables(path);
        let levels = Arc::new(ArcSwap::from_pointee(level_state));

        let memtables = Arc::new(MemTableBuffer::new(MEMTABLE_THRESHOLD));

        let compaction = CompactionTask::new(path.to_path_buf(), levels.clone());

        let (shutdown_tx, shutdown_rx) = crossbeam_channel::bounded(1);

        let engine = StorageEngine {
            path: path.to_path_buf(),
            memtables,
            levels,
            wal: Mutex::new(wal),
            compaction,
            shutdown: shutdown_tx,
        };

        engine.recover()?;

        let flush_path = engine.path.clone();
        let flush_memtables = engine.memtables.clone();
        let flush_compaction = CompactionTask::new(engine.path.clone(), engine.levels.clone());
        let flush_shutdown = shutdown_rx.clone();

        std::thread::Builder::new()
            .name("tsdb-flush".to_string())
            .spawn(move || {
                loop {
                    if flush_memtables.active_size() >= MEMTABLE_THRESHOLD
                        || flush_memtables.has_immutable()
                    {
                        if let Some(frozen) = flush_memtables.freeze() {
                            let entries: Vec<_> = frozen.iter().collect();
                            if !entries.is_empty() {
                                let sstables_path = flush_path.join("sstables").join("level0");
                                let _ = std::fs::create_dir_all(&sstables_path);

                                let timestamp = std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap()
                                    .as_nanos();

                                let sstable_path =
                                    sstables_path.join(format!("{}.sst", timestamp));
                                if let Ok(sstable) = SSTable::create(&sstable_path, &entries) {
                                    let sstable = Arc::new(sstable);
                                    let _ = flush_compaction.add_sstable_to_level(0, sstable);

                                    flush_memtables.clear_immutable();

                                    let wal_path = flush_path.join("wal").join("current.log");
                                    let _ = std::fs::remove_file(&wal_path);

                                    let _ = flush_compaction.maybe_compact();
                                }
                            }
                        }
                    }

                    crossbeam_channel::select! {
                        recv(flush_shutdown) -> _ => break,
                        default(Duration::from_millis(100)) => {}
                    }
                }
            })?;

        let compact_compaction = CompactionTask::new(engine.path.clone(), engine.levels.clone());
        let compact_shutdown = shutdown_rx.clone();

        std::thread::Builder::new()
            .name("tsdb-compaction".to_string())
            .spawn(move || {
                loop {
                    crossbeam_channel::select! {
                        recv(compact_shutdown) -> _ => break,
                        default(COMPACTION_CHECK_INTERVAL) => {
                            let _ = compact_compaction.maybe_compact();
                        }
                    }
                }
            })?;

        Ok(engine)
    }

    fn recover(&self) -> Result<()> {
        let wal_path = self.path.join("wal").join("current.log");
        let entries = WAL::recover(&wal_path)?;

        for entry in entries {
            let value: Value = bincode::deserialize(&entry.value)?;
            let field = entry.field;
            self.memtables
                .insert_raw((entry.series_key, field, entry.timestamp), value);
        }

        Ok(())
    }

    fn load_sstables(path: &Path) -> LevelState {
        let mut levels = Vec::new();

        for level in 0..4 {
            let level_path = path.join("sstables").join(format!("level{}", level));
            if !level_path.exists() {
                levels.push(Vec::new());
                continue;
            }

            let mut level_sstables = Vec::new();

            if let Ok(dir_entries) = std::fs::read_dir(level_path) {
                for entry in dir_entries.flatten() {
                    if entry.path().extension().and_then(|s| s.to_str()) == Some("sst") {
                        if let Ok(sstable) = SSTable::load(&entry.path()) {
                            level_sstables.push(Arc::new(sstable));
                        }
                    }
                }
            }

            levels.push(level_sstables);
        }

        levels
    }

    pub fn insert(
        &self,
        series_key: &SeriesKey,
        field: &str,
        timestamp: i64,
        value: Value,
    ) -> Result<()> {
        let wal_entry = WALEntry {
            series_key: series_key.to_bytes(),
            field: field.to_string(),
            timestamp,
            value: bincode::serialize(&value)?,
        };

        {
            let wal = self.wal.lock();
            wal.append(&wal_entry)?;
        }

        let should_flush = self.memtables.insert(series_key, field, timestamp, value);

        if should_flush {
            if let Some(frozen) = self.memtables.freeze() {
                let path = self.path.clone();
                let compaction = CompactionTask::new(self.path.clone(), self.levels.clone());

                std::thread::spawn(move || {
                    let entries: Vec<_> = frozen.iter().collect();
                    if entries.is_empty() {
                        return;
                    }

                    let sstables_path = path.join("sstables").join("level0");
                    if std::fs::create_dir_all(&sstables_path).is_err() {
                        return;
                    }

                    let timestamp = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_nanos();

                    let sstable_path = sstables_path.join(format!("{}.sst", timestamp));
                    if let Ok(sstable) = SSTable::create(&sstable_path, &entries) {
                        let sstable = Arc::new(sstable);
                        let _ = compaction.add_sstable_to_level(0, sstable);
                        let _ = compaction.maybe_compact();
                    }
                });
            }
        }

        Ok(())
    }

    pub fn get(
        &self,
        series_key: &SeriesKey,
        field: &str,
        timestamp: i64,
    ) -> Result<Option<Value>> {
        if let Some(value) = self.memtables.get(series_key, field, timestamp) {
            return Ok(Some(value));
        }

        let snapshot = self.levels.load();
        for level in snapshot.iter() {
            for sstable in level.iter() {
                if let Some(value) = sstable.get(&series_key.to_bytes(), field, timestamp)? {
                    return Ok(Some(value));
                }
            }
        }

        Ok(None)
    }

    pub fn range(
        &self,
        series_key: &SeriesKey,
        field: &str,
        start: i64,
        end: i64,
    ) -> Result<Vec<(i64, Value)>> {
        let mut result = self.memtables.range(series_key, field, start, end);

        let snapshot = self.levels.load();
        for level in snapshot.iter() {
            for sstable in level.iter() {
                let sstable_data = sstable.range(&series_key.to_bytes(), field, start, end)?;
                result.extend(sstable_data);
            }
        }

        result.sort_by_key(|(ts, _)| *ts);
        result.dedup_by_key(|(ts, _)| *ts);

        Ok(result)
    }

    pub fn flush(&self) -> Result<()> {
        if let Some(frozen) = self.memtables.freeze() {
            let entries: Vec<_> = frozen.iter().collect();
            if !entries.is_empty() {
                let sstables_path = self.path.join("sstables").join("level0");
                std::fs::create_dir_all(&sstables_path)?;

                let timestamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos();

                let sstable_path = sstables_path.join(format!("{}.sst", timestamp));
                let sstable = SSTable::create(&sstable_path, &entries)?;
                let sstable = Arc::new(sstable);

                self.compaction.add_sstable_to_level(0, sstable)?;
                self.memtables.clear_immutable();
            }
        }

        Ok(())
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn level_stats(&self) -> Vec<(usize, usize)> {
        let snapshot = self.levels.load();
        snapshot
            .iter()
            .enumerate()
            .map(|(i, level)| (i, level.len()))
            .collect()
    }
}

impl Drop for StorageEngine {
    fn drop(&mut self) {
        let _ = self.flush();
        let _ = self.shutdown.send(());
    }
}
