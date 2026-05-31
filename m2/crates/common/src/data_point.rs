use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Value {
    Float(f64),
    Integer(i64),
    Boolean(bool),
    String(String),
}

impl Value {
    pub fn as_float(&self) -> Option<f64> {
        match self {
            Value::Float(f) => Some(*f),
            Value::Integer(i) => Some(*i as f64),
            _ => None,
        }
    }

    pub fn as_integer(&self) -> Option<i64> {
        match self {
            Value::Integer(i) => Some(*i),
            Value::Float(f) => Some(*f as i64),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataPoint {
    pub measurement: String,
    pub tags: Vec<(String, String)>,
    pub timestamp: i64,
    pub fields: Vec<(String, Value)>,
}

impl DataPoint {
    pub fn new(measurement: String) -> Self {
        DataPoint {
            measurement,
            tags: Vec::new(),
            timestamp: Utc::now().timestamp_millis(),
            fields: Vec::new(),
        }
    }

    pub fn with_tag(mut self, key: String, value: String) -> Self {
        self.tags.push((key, value));
        self
    }

    pub fn with_timestamp(mut self, timestamp: i64) -> Self {
        self.timestamp = timestamp;
        self
    }

    pub fn add_field(&mut self, key: String, value: Value) {
        self.fields.push((key, value));
    }

    pub fn with_field(mut self, key: String, value: Value) -> Self {
        self.fields.push((key, value));
        self
    }

    pub fn datetime(&self) -> DateTime<Utc> {
        DateTime::from_timestamp_millis(self.timestamp).unwrap_or_else(Utc::now)
    }
}
