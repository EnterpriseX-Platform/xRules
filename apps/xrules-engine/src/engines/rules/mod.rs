pub mod executor;
pub mod context;
pub mod nodes;

use crate::engines::{Engine, EngineError, Result};
use crate::engines::rules::executor::RulesExecutor;
use crate::engines::rules::nodes::NodeRegistry;
use crate::hub::router::Rule;
use crate::hub::types::Standard;
use async_trait::async_trait;
use serde_json::Value;

pub struct RulesEngine {
    db_pool: sqlx::PgPool,
    node_registry: NodeRegistry,
}

impl RulesEngine {
    pub async fn new(db_pool: sqlx::PgPool) -> Result<Self> {
        let node_registry = NodeRegistry::new();
        
        Ok(Self {
            db_pool,
            node_registry,
        })
    }
}

#[async_trait]
impl Engine for RulesEngine {
    async fn execute(&self, rule: Rule, input: Value) -> Result<Value> {
        let executor = RulesExecutor::new(self.db_pool.clone(), &self.node_registry);
        executor.execute(&rule, input).await
    }
    
    fn validate(&self, rule: &Rule) -> Result<()> {
        // Validate DMN structure if present
        if let Some(_dmn) = rule.definition.get("dmn") {
            // DMN validation logic
        }
        Ok(())
    }
    
    fn supported_standards(&self) -> Vec<Standard> {
        vec![
            Standard::new("DMN", "1.4", "Decision Model and Notation"),
            Standard::new("JSON", "RFC 8259", "JavaScript Object Notation"),
            Standard::new("JSON Schema", "2020-12", "JSON Schema Draft"),
        ]
    }
    
    fn name(&self) -> &str {
        "rules-engine"
    }
    
    fn version(&self) -> &str {
        "0.1.0"
    }
}
