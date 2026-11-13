pub mod registry;
pub mod router;
pub mod types;

pub use types::{EngineType, ExecuteRequest, ExecuteResponse, RulePayload, Standard};
pub use registry::EngineRegistry;

use crate::engines::ai::AiEngine;
use crate::engines::llm::LlmEngine;
use crate::engines::ml::MlEngine;
use crate::engines::pmml::PmmlEngine;
use crate::engines::rules::RulesEngine;
use crate::engines::Engine;
use crate::hub::router::Rule;
use serde_json::Value;
use std::collections::HashMap;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum HubError {
    #[error("Engine not found: {0}")]
    EngineNotFound(String),

    #[error("Engine error: {0}")]
    EngineError(String),

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
}

impl EngineHub {
    pub async fn new() -> Result<Self> {
        // Initialize all engines (no DB needed)
        let mut engines: HashMap<EngineType, Box<dyn Engine>> = HashMap::new();

        // Rules Engine (Rust - Core) - no DB dependency
        engines.insert(
            EngineType::Rules,
            Box::new(RulesEngine::new_stateless().await?),
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

        Ok(Self { registry })
    }

    pub async fn execute(&self, req: ExecuteRequest) -> Result<Value> {
        // Build a Rule struct from the inline payload
        let engine_str = &req.rule.engine;
        let rule = Rule {
            id: "inline".to_string(),
            name: "inline".to_string(),
            rule_type: req.rule.rule_type,
            definition: req.rule.definition,
            status: "PUBLISHED".to_string(),
            project_id: String::new(),
            engine: engine_str.clone(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };

        // Route to appropriate engine
        let engine_type =
            EngineType::from_str(engine_str).map_err(|e| HubError::EngineError(e))?;

        // Execute on target engine
        let engine = self.registry.get(engine_type)?;
        let output = engine
            .execute(rule, req.input)
            .await
            .map_err(|e| HubError::EngineError(e.to_string()))?;

        Ok(output)
    }

    pub async fn validate_rule(&self, rule_payload: &RulePayload) -> Result<()> {
        let rule = Rule {
            id: "validate".to_string(),
            name: "validate".to_string(),
            rule_type: rule_payload.rule_type.clone(),
            definition: rule_payload.definition.clone(),
            status: "DRAFT".to_string(),
            project_id: String::new(),
            engine: rule_payload.engine.clone(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };

        let engine_type =
            EngineType::from_str(&rule_payload.engine).map_err(|e| HubError::EngineError(e))?;
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


