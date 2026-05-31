use parking_lot::Mutex;
use std::fs::{File, OpenOptions};
use std::io::{BufReader, BufWriter, Write, Read};
use std::path::{Path, PathBuf};
use common::Result;
use crc32fast::Hasher;

#[derive(Debug)]
pub struct WALEntry {
    pub series_key: Vec<u8>,
    pub field: String,
    pub timestamp: i64,
    pub value: Vec<u8>,
}

pub struct WAL {
    path: PathBuf,
    writer: Mutex<BufWriter<File>>,
}

impl WAL {
    pub fn new(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)?;

        Ok(WAL {
            path: path.to_path_buf(),
            writer: Mutex::new(BufWriter::new(file)),
        })
    }

    pub fn append(&self, entry: &WALEntry) -> Result<()> {
        let mut writer = self.writer.lock();
        Self::write_entry(&mut writer, entry)?;
        writer.flush()?;
        Ok(())
    }

    pub fn append_batch(&self, entries: &[WALEntry]) -> Result<()> {
        let mut writer = self.writer.lock();
        for entry in entries {
            Self::write_entry(&mut writer, entry)?;
        }
        writer.flush()?;
        Ok(())
    }

    fn write_entry(writer: &mut BufWriter<File>, entry: &WALEntry) -> Result<()> {
        let mut data = Vec::new();

        data.extend_from_slice(&(entry.series_key.len() as u32).to_le_bytes());
        data.extend_from_slice(&entry.series_key);

        data.extend_from_slice(&(entry.field.len() as u32).to_le_bytes());
        data.extend_from_slice(entry.field.as_bytes());

        data.extend_from_slice(&entry.timestamp.to_le_bytes());

        data.extend_from_slice(&(entry.value.len() as u32).to_le_bytes());
        data.extend_from_slice(&entry.value);

        let mut hasher = Hasher::new();
        hasher.update(&data);
        let checksum = hasher.finalize();
        data.extend_from_slice(&checksum.to_le_bytes());

        writer.write_all(&data)?;
        Ok(())
    }

    pub fn sync(&self) -> Result<()> {
        let mut writer = self.writer.lock();
        writer.flush()?;
        Ok(())
    }

    pub fn recover(path: &Path) -> Result<Vec<WALEntry>> {
        if !path.exists() {
            return Ok(Vec::new());
        }

        let file = File::open(path)?;
        let mut reader = BufReader::new(file);
        let mut entries = Vec::new();

        loop {
            let mut len_buf = [0u8; 4];
            if reader.read_exact(&mut len_buf).is_err() {
                break;
            }
            let series_key_len = u32::from_le_bytes(len_buf) as usize;

            let mut series_key = vec![0u8; series_key_len];
            reader.read_exact(&mut series_key)?;

            reader.read_exact(&mut len_buf)?;
            let field_len = u32::from_le_bytes(len_buf) as usize;

            let mut field_buf = vec![0u8; field_len];
            reader.read_exact(&mut field_buf)?;
            let field = String::from_utf8_lossy(&field_buf).to_string();

            let mut ts_buf = [0u8; 8];
            reader.read_exact(&mut ts_buf)?;
            let timestamp = i64::from_le_bytes(ts_buf);

            reader.read_exact(&mut len_buf)?;
            let value_len = u32::from_le_bytes(len_buf) as usize;

            let mut value = vec![0u8; value_len];
            reader.read_exact(&mut value)?;

            let mut checksum_buf = [0u8; 4];
            if reader.read_exact(&mut checksum_buf).is_err() {
                break;
            }
            let stored_checksum = u32::from_le_bytes(checksum_buf);

            let mut data = Vec::new();
            data.extend_from_slice(&(series_key_len as u32).to_le_bytes());
            data.extend_from_slice(&series_key);
            data.extend_from_slice(&(field_len as u32).to_le_bytes());
            data.extend_from_slice(field.as_bytes());
            data.extend_from_slice(&timestamp.to_le_bytes());
            data.extend_from_slice(&(value_len as u32).to_le_bytes());
            data.extend_from_slice(&value);

            let mut hasher = Hasher::new();
            hasher.update(&data);
            let computed_checksum = hasher.finalize();

            if stored_checksum == computed_checksum {
                entries.push(WALEntry {
                    series_key,
                    field,
                    timestamp,
                    value,
                });
            }
        }

        Ok(entries)
    }

    pub fn delete(&self) -> Result<()> {
        std::fs::remove_file(&self.path)?;
        Ok(())
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}
