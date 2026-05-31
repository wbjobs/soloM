use std::fs::{File, OpenOptions};
use std::io::{BufWriter, Read, Write, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use common::{TsdbError, Result, Value};
use crc32fast::Hasher;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct SSTableEntry {
    pub series_key: Vec<u8>,
    pub field: String,
    pub timestamp: i64,
    pub value: Value,
}

pub struct SSTable {
    path: PathBuf,
    index: HashMap<(Vec<u8>, String), (u64, u64)>,
}

impl SSTable {
    pub fn create(path: &Path, entries: &[((Vec<u8>, String, i64), Value)]) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(path)?;
        
        let mut writer = BufWriter::new(file);
        let mut index = HashMap::new();
        
        let mut current_key: Option<(Vec<u8>, String)> = None;
        let mut current_start: u64 = 0;
        let mut current_count: u64 = 0;
        
        for ((series_key, field, timestamp), value) in entries {
            let key = (series_key.clone(), field.clone());
            
            if current_key.as_ref() != Some(&key) {
                if let Some(prev_key) = current_key.take() {
                    index.insert(prev_key, (current_start, current_count));
                }
                current_key = Some(key.clone());
                current_start = writer.stream_position()?;
                current_count = 0;
            }
            
            let value_bytes = bincode::serialize(value)?;
            
            let mut data = Vec::new();
            data.extend_from_slice(&timestamp.to_le_bytes());
            data.extend_from_slice(&(value_bytes.len() as u32).to_le_bytes());
            data.extend_from_slice(&value_bytes);
            
            let mut hasher = Hasher::new();
            hasher.update(&data);
            let checksum = hasher.finalize();
            data.extend_from_slice(&checksum.to_le_bytes());
            
            writer.write_all(&data)?;
            current_count += 1;
        }
        
        if let Some(last_key) = current_key.take() {
            index.insert(last_key, (current_start, current_count));
        }
        
        let _index_pos = writer.stream_position()?;
        let index_bytes = bincode::serialize(&index)?;
        writer.write_all(&index_bytes)?;
        writer.write_all(&(index_bytes.len() as u64).to_le_bytes())?;
        
        writer.flush()?;
        
        Ok(SSTable {
            path: path.to_path_buf(),
            index,
        })
    }

    pub fn load(path: &Path) -> Result<Self> {
        let mut file = File::open(path)?;
        let file_size = file.metadata()?.len();
        
        if file_size < 8 {
            return Err(TsdbError::Storage("Invalid SSTable file".to_string()));
        }
        
        file.seek(SeekFrom::End(-8))?;
        let mut index_len_buf = [0u8; 8];
        file.read_exact(&mut index_len_buf)?;
        let index_len = u64::from_le_bytes(index_len_buf);
        
        let index_pos = file_size - 8 - index_len;
        file.seek(SeekFrom::Start(index_pos))?;
        
        let mut index_bytes = vec![0u8; index_len as usize];
        file.read_exact(&mut index_bytes)?;
        
        let index: HashMap<(Vec<u8>, String), (u64, u64)> = bincode::deserialize(&index_bytes)?;
        
        Ok(SSTable {
            path: path.to_path_buf(),
            index,
        })
    }

    pub fn get(&self, series_key: &[u8], field: &str, timestamp: i64) -> Result<Option<Value>> {
        let key = (series_key.to_vec(), field.to_string());
        let Some((offset, count)) = self.index.get(&key) else {
            return Ok(None);
        };
        
        let mut file = File::open(&self.path)?;
        file.seek(SeekFrom::Start(*offset))?;
        
        for _ in 0..*count {
            let entry = Self::read_entry(&mut file)?;
            if entry.timestamp == timestamp {
                return Ok(Some(entry.value));
            }
            if entry.timestamp > timestamp {
                break;
            }
        }
        
        Ok(None)
    }

    pub fn range(
        &self,
        series_key: &[u8],
        field: &str,
        start: i64,
        end: i64,
    ) -> Result<Vec<(i64, Value)>> {
        let key = (series_key.to_vec(), field.to_string());
        let Some((offset, count)) = self.index.get(&key) else {
            return Ok(Vec::new());
        };
        
        let mut file = File::open(&self.path)?;
        file.seek(SeekFrom::Start(*offset))?;
        
        let mut result = Vec::new();
        
        for _ in 0..*count {
            let entry = Self::read_entry(&mut file)?;
            if entry.timestamp >= start && entry.timestamp <= end {
                result.push((entry.timestamp, entry.value));
            }
            if entry.timestamp > end {
                break;
            }
        }
        
        Ok(result)
    }

    fn read_entry(file: &mut File) -> Result<SSTableEntry> {
        let mut ts_buf = [0u8; 8];
        file.read_exact(&mut ts_buf)?;
        let timestamp = i64::from_le_bytes(ts_buf);
        
        let mut len_buf = [0u8; 4];
        file.read_exact(&mut len_buf)?;
        let value_len = u32::from_le_bytes(len_buf) as usize;
        
        let mut value_buf = vec![0u8; value_len];
        file.read_exact(&mut value_buf)?;
        
        let mut checksum_buf = [0u8; 4];
        file.read_exact(&mut checksum_buf)?;
        let stored_checksum = u32::from_le_bytes(checksum_buf);
        
        let mut data = Vec::new();
        data.extend_from_slice(&ts_buf);
        data.extend_from_slice(&len_buf);
        data.extend_from_slice(&value_buf);
        
        let mut hasher = Hasher::new();
        hasher.update(&data);
        let computed_checksum = hasher.finalize();
        
        if stored_checksum != computed_checksum {
            return Err(TsdbError::Storage("Checksum mismatch in SSTable".to_string()));
        }
        
        let value: Value = bincode::deserialize(&value_buf)?;
        
        Ok(SSTableEntry {
            series_key: Vec::new(),
            field: String::new(),
            timestamp,
            value,
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn series_keys(&self) -> Vec<Vec<u8>> {
        let mut keys: Vec<Vec<u8>> = self.index.keys().map(|(k, _)| k.clone()).collect();
        keys.dedup();
        keys
    }

    pub fn read_all(&self) -> Result<Vec<((Vec<u8>, String, i64), Value)>> {
        let mut result = Vec::new();
        
        for ((series_key, field), (offset, count)) in &self.index {
            let mut file = File::open(&self.path)?;
            file.seek(SeekFrom::Start(*offset))?;
            
            for _ in 0..*count {
                let entry = Self::read_entry(&mut file)?;
                result.push((
                    (series_key.clone(), field.clone(), entry.timestamp),
                    entry.value,
                ));
            }
        }
        
        Ok(result)
    }
}
