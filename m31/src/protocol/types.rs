use serde::{Deserialize, Serialize};
use std::fmt;
use std::time::SystemTime;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FieldValue {
    Integer(i64),
    Float(f64),
    Boolean(bool),
    String(String),
}

impl fmt::Display for FieldValue {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FieldValue::Integer(v) => write!(f, "{}i", v),
            FieldValue::Float(v) => write!(f, "{}", v),
            FieldValue::Boolean(v) => write!(f, "{}", v),
            FieldValue::String(v) => write!(f, "\"{}\"", v),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Field {
    pub key: String,
    pub value: FieldValue,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Point {
    pub measurement: String,
    pub tags: std::collections::HashMap<String, String>,
    pub fields: Vec<Field>,
    pub timestamp: SystemTime,
    pub raw_line: String,
}

impl Point {
    pub fn sharding_key(&self) -> &str {
        &self.measurement
    }
}
