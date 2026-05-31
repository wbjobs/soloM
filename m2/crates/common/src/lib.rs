pub mod data_point;
pub mod error;
pub mod series;
pub mod continuous_query;

pub use data_point::{DataPoint, Value};
pub use error::TsdbError;
pub use series::{SeriesKey, Tag, Tags};
pub use continuous_query::{
    TimeUnit, Duration, AggregateType,
    ContinuousQueryDefinition, ContinuousQueryStatus, CQResult,
};

pub type Result<T> = std::result::Result<T, TsdbError>;
