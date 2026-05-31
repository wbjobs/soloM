use std::path::PathBuf;
use std::sync::Arc;
use arc_swap::ArcSwap;
use common::{Result, Value};
use crate::sstable::SSTable;

pub const MAX_LEVELS: usize = 4;
pub const LEVEL_0_COMPACTION_TRIGGER: usize = 4;
pub const MAX_LEVEL_FACTOR: usize = 8;

pub type LevelState = Vec<Vec<Arc<SSTable>>>;
pub type SharedLevelState = Arc<ArcSwap<LevelState>>;

pub struct CompactionTask {
    path: PathBuf,
    levels: SharedLevelState,
}

impl CompactionTask {
    pub fn new(path: PathBuf, levels: SharedLevelState) -> Self {
        CompactionTask { path, levels }
    }

    pub fn maybe_compact(&self) -> Result<bool> {
        let snapshot = self.levels.load_full();
        let needs_compaction = self.find_compaction_level(snapshot.as_ref());

        if let Some((level, file_count)) = needs_compaction {
            tracing::info!(
                "Compaction triggered: level {} has {} files (trigger: {})",
                level,
                file_count,
                LEVEL_0_COMPACTION_TRIGGER
            );
            self.compact_level(level, snapshot.as_ref())?;
            return Ok(true);
        }

        Ok(false)
    }

    fn find_compaction_level(&self, levels: &LevelState) -> Option<(usize, usize)> {
        for level in 0..levels.len() {
            let file_count = levels[level].len();
            let trigger = if level == 0 {
                LEVEL_0_COMPACTION_TRIGGER
            } else {
                MAX_LEVEL_FACTOR * (1 << level.min(MAX_LEVELS - 1))
            };

            if file_count >= trigger {
                return Some((level, file_count));
            }
        }
        None
    }

    fn compact_level(&self, level: usize, current: &LevelState) -> Result<()> {
        if level >= current.len() || current[level].is_empty() {
            return Ok(());
        }

        let target_level = level + 1;

        let mut merged_entries: Vec<((Vec<u8>, String, i64), Value)> = Vec::new();

        for sstable in &current[level] {
            let data = sstable.read_all()?;
            merged_entries.extend(data);
        }

        if target_level < current.len() {
            for sstable in &current[target_level] {
                let data = sstable.read_all()?;
                merged_entries.extend(data);
            }
        }

        merged_entries.sort_by(|a, b| a.0.cmp(&b.0));
        merged_entries.dedup_by_key(|((series, field, ts), _)| {
            (series.clone(), field.clone(), *ts)
        });

        let target_path = self.path.join("sstables").join(format!("level{}", target_level));
        std::fs::create_dir_all(&target_path)?;

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();

        let new_sstable_path = target_path.join(format!("{}.sst", timestamp));
        let new_sstable = Arc::new(SSTable::create(&new_sstable_path, &merged_entries)?);

        let old_source_paths: Vec<PathBuf> = current[level].iter().map(|s| s.path().to_path_buf()).collect();
        let old_target_paths: Vec<PathBuf> = if target_level < current.len() {
            current[target_level].iter().map(|s| s.path().to_path_buf()).collect()
        } else {
            Vec::new()
        };

        let mut new_levels = current.clone();

        while new_levels.len() <= target_level {
            new_levels.push(Vec::new());
        }

        new_levels[level] = Vec::new();
        new_levels[target_level] = vec![new_sstable];

        self.levels.store(Arc::new(new_levels));

        for path in &old_source_paths {
            let _ = std::fs::remove_file(path);
        }
        for path in &old_target_paths {
            let _ = std::fs::remove_file(path);
        }

        tracing::info!(
            "Compaction completed: level {} -> level {}, {} entries merged",
            level,
            target_level,
            merged_entries.len()
        );

        Ok(())
    }

    pub fn add_sstable_to_level(&self, level: usize, sstable: Arc<SSTable>) -> Result<()> {
        loop {
            let current = self.levels.load_full();
            let mut new_levels = (*current).clone();

            while new_levels.len() <= level {
                new_levels.push(Vec::new());
            }

            new_levels[level].push(sstable.clone());

            let current_ptr = Arc::as_ptr(&current);
            let new_state = Arc::new(new_levels);
            self.levels.store(new_state);

            let verify = self.levels.load_full();
            if Arc::as_ptr(&verify) != current_ptr {
                break;
            }
        }

        Ok(())
    }
}
