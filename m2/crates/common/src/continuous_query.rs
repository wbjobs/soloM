use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TimeUnit {
    Milliseconds,
    Seconds,
    Minutes,
    Hours,
    Days,
    Weeks,
}

impl TimeUnit {
    pub fn to_millis(&self) -> i64 {
        match self {
            TimeUnit::Milliseconds => 1,
            TimeUnit::Seconds => 1000,
            TimeUnit::Minutes => 60 * 1000,
            TimeUnit::Hours => 60 * 60 * 1000,
            TimeUnit::Days => 24 * 60 * 60 * 1000,
            TimeUnit::Weeks => 7 * 24 * 60 * 60 * 1000,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Duration {
    pub value: i64,
    pub unit: TimeUnit,
}

impl Duration {
    pub fn to_millis(&self) -> i64 {
        self.value * self.unit.to_millis()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AggregateType {
    Mean,
    Sum,
    Count,
    Min,
    Max,
    First,
    Last,
}

impl std::fmt::Display for AggregateType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AggregateType::Mean => write!(f, "mean"),
            AggregateType::Sum => write!(f, "sum"),
            AggregateType::Count => write!(f, "count"),
            AggregateType::Min => write!(f, "min"),
            AggregateType::Max => write!(f, "max"),
            AggregateType::First => write!(f, "first"),
            AggregateType::Last => write!(f, "last"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContinuousQueryDefinition {
    pub name: String,
    pub source_measurement: String,
    pub target_measurement: String,
    pub field: String,
    pub aggregate: AggregateType,
    pub interval: Duration,
    pub tags: Vec<String>,
    pub enabled: bool,
}

impl ContinuousQueryDefinition {
    pub fn new(
        name: String,
        source_measurement: String,
        target_measurement: String,
        field: String,
        aggregate: AggregateType,
        interval: Duration,
    ) -> Self {
        ContinuousQueryDefinition {
            name,
            source_measurement,
            target_measurement,
            field,
            aggregate,
            interval,
            tags: Vec::new(),
            enabled: true,
        }
    }

    pub fn with_tags(mut self, tags: Vec<String>) -> Self {
        self.tags = tags;
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContinuousQueryStatus {
    pub name: String,
    pub enabled: bool,
    pub last_run: Option<i64>,
    pub next_run: Option<i64>,
    pub run_count: u64,
    pub error_count: u64,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CQResult {
    pub window_start: i64,
    pub window_end: i64,
    pub tags: Vec<(String, String)>,
    pub value: f64,
}
