pub mod api;
pub mod auth;
pub mod engines;
pub mod hub;
pub mod protocol;
pub mod standards;

use std::sync::Arc;
use auth::service::AuthService;
use auth::middleware::AuthConfig;
use hub::EngineHub;

#[derive(Clone)]
pub struct AppState {
    pub hub: Arc<EngineHub>,
    pub auth_service: Arc<AuthService>,
    pub auth_config: Arc<AuthConfig>,
}

use thiserror::Error;

#[derive(Error, Debug)]
pub enum XRulesError {
    #[error("Execution error: {0}")]
    Execution(String),
    
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    
    #[error("HTTP error: {0}")]
    Http(String),
    
    #[error("Rule not found: {0}")]
    RuleNotFound(String),
    
    #[error("Validation error: {0}")]
    Validation(String),
}

pub type Result<T> = std::result::Result<T, XRulesError>;
