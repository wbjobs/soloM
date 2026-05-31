use thiserror::Error;

#[derive(Error, Debug)]
pub enum TsdbError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("Query parsing error: {0}")]
    QueryParse(String),

    #[error("Storage error: {0}")]
    Storage(String),

    #[error("Series not found: {0}")]
    SeriesNotFound(String),

    #[error("Invalid argument: {0}")]
    InvalidArgument(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<bincode::Error> for TsdbError {
    fn from(e: bincode::Error) -> Self {
        TsdbError::Serialization(e.to_string())
    }
}
