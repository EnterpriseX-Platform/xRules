pub mod config;
pub mod engine;
pub mod executors;
pub mod models;
pub mod nodes;
pub mod server;
pub mod stores;
pub mod utils;

pub use config::Config;
pub use engine::{ExecutionContextManager, ExecutionEngine};
pub use models::*;

use thiserror::Error;

#[derive(Error, Debug)]
pub enum XRulesError {
    #[error("Configuration error: {0}")]
    Config(String),
    
    #[error("Execution error: {0}")]
    Execution(String),
    
    #[error("Node error: {0}")]
    Node(String),
    
    #[error("Store error: {0}")]
    Store(String),
    
    #[error("Connection error: {0}")]
    Connection(String),
    
    #[error("Validation error: {0}")]
    Validation(String),
    
    #[error("Not found: {0}")]
    NotFound(String),
    
    #[error("Timeout error: {0}")]
    Timeout(String),
    
    #[error("Cancelled: {0}")]
    Cancelled(String),
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    
    #[error("Redis error: {0}")]
    Redis(String),
}

impl From<fred::error::Error> for XRulesError {
    fn from(e: fred::error::Error) -> Self {
        XRulesError::Redis(e.to_string())
    }
}

pub type Result<T> = std::result::Result<T, XRulesError>;
