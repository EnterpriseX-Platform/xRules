pub mod ai;
pub mod llm;
pub mod ml;
pub mod pmml;
pub mod rules;

use crate::hub::router::Rule;
use crate::hub::types::Standard;
use async_trait::async_trait;
use serde_json::Value;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum EngineError {
    #[error("Execution error: {0}")]
    Execution(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Not implemented")]
    NotImplemented,

    #[error("External service error: {0}")]
    External(String),
}

pub type Result<T> = std::result::Result<T, EngineError>;

#[async_trait]
pub trait Engine: Send + Sync {
    /// Execute a rule with given input
    async fn execute(&self, rule: Rule, input: Value) -> Result<Value>;

    /// Validate a rule definition
    fn validate(&self, _rule: &Rule) -> Result<()> {
        // Default: no validation
        Ok(())
    }

    /// Check if engine is healthy
    async fn is_healthy(&self) -> bool {
        true
    }

    /// Get supported standards
    fn supported_standards(&self) -> Vec<Standard>;

    /// Get engine name
    fn name(&self) -> &str;

    /// Get engine version
    fn version(&self) -> &str;
}
