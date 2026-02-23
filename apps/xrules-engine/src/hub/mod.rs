pub mod registry;
pub mod router;
pub mod types;

pub use types::{EngineType, ExecuteRequest, Standard};
pub use registry::EngineRegistry;

use crate::engines::ai::AiEngine;
use crate::engines::llm::LlmEngine;
use crate::engines::ml::MlEngine;
use crate::engines::pmml::PmmlEngine;
use crate::engines::rules::RulesEngine;
use crate::engines::Engine;
use crate::hub::router::EngineRouter;
use serde_json::Value;
use std::collections::HashMap;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum HubError {
    #[error("Engine not found: {0}")]
    EngineNotFound(String),

    #[error("Engine error: {0}")]
    EngineError(String),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Validation error: {0}")]
    Validation(String),
    
    #[error("Rule not found: {0}")]
    RuleNotFound(String),
}

impl From<crate::engines::EngineError> for HubError {
    fn from(e: crate::engines::EngineError) -> Self {
        HubError::EngineError(e.to_string())
    }
}

pub type Result<T> = std::result::Result<T, HubError>;

pub struct EngineHub {
    registry: EngineRegistry,
    router: EngineRouter,
    db_pool: sqlx::PgPool,
}

impl EngineHub {
    pub async fn new() -> Result<Self> {
        let database_url = std::env::var("DATABASE_URL")
            .map_err(|_| HubError::EngineError("DATABASE_URL not set".to_string()))?;

        let db_pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(20)
            .connect(&database_url)
            .await?;

        // Initialize all engines
        let mut engines: HashMap<EngineType, Box<dyn Engine>> = HashMap::new();

        // Rules Engine (Rust - Core)
        engines.insert(
            EngineType::Rules,
            Box::new(RulesEngine::new(db_pool.clone()).await?),
        );

        // PMML Engine (R)
        engines.insert(
            EngineType::Pmml,
            Box::new(PmmlEngine::new().await?),
        );

        // ML Engine (Python)
        engines.insert(
            EngineType::Ml,
            Box::new(MlEngine::new().await?),
        );

        // LLM Engine (Python)
        engines.insert(
            EngineType::Llm,
            Box::new(LlmEngine::new().await?),
        );

        // AI Engine (Python)
        engines.insert(
            EngineType::Ai,
            Box::new(AiEngine::new().await?),
        );

        let registry = EngineRegistry::new(engines);
        let router = EngineRouter::new(db_pool.clone());

        Ok(Self {
            registry,
            router,
            db_pool,
        })
    }

    pub async fn execute(&self, req: ExecuteRequest) -> Result<Value> {
        // 1. Load rule from DB to determine which engine to use
        let rule = self.router.get_rule(&req.rule_id).await?;

        // 2. Route to appropriate engine
        let engine_type =
            EngineType::from_str(&rule.engine).map_err(|e| HubError::EngineError(e))?;

        // 3. Execute on target engine
        let engine = self.registry.get(engine_type)?;
        let output = engine
            .execute(rule, req.input)
            .await
            .map_err(|e| HubError::EngineError(e.to_string()))?;

        Ok(output)
    }

    pub async fn validate(&self, rule_id: &str) -> Result<()> {
        let rule = self.router.get_rule(rule_id).await?;
        let engine_type =
            EngineType::from_str(&rule.engine).map_err(|e| HubError::EngineError(e))?;
        let engine = self.registry.get(engine_type)?;

        engine
            .validate(&rule)
            .map_err(|e| HubError::Validation(e.to_string()))?;

        Ok(())
    }

    pub async fn list_engines(&self) -> Vec<EngineInfo> {
        self.registry.list_engines().await
    }

    pub async fn get_engine_standards(&self, engine_type: EngineType) -> Vec<Standard> {
        match self.registry.get(engine_type) {
            Ok(engine) => engine.supported_standards(),
            Err(_) => vec![],
        }
    }
}

#[derive(Debug, serde::Serialize)]
pub struct EngineInfo {
    pub name: String,
    pub engine_type: String,
    pub status: String,
    pub standards: Vec<String>,
    pub version: String,
}

impl EngineType {
    pub fn from_str(s: &str) -> std::result::Result<Self, String> {
        match s.to_lowercase().as_str() {
            "rules" | "rust" => Ok(EngineType::Rules),
            "pmml" | "r" => Ok(EngineType::Pmml),
            "ml" | "python-ml" => Ok(EngineType::Ml),
            "llm" => Ok(EngineType::Llm),
            "ai" | "deep-learning" => Ok(EngineType::Ai),
            _ => Err(format!("Unknown engine type: {}", s)),
        }
    }
}
