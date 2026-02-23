use crate::engines::{Engine, EngineError, Result};
use crate::hub::router::Rule;
use crate::hub::types::Standard;
use async_trait::async_trait;
use serde_json::Value;

pub struct PmmlEngine {
    // R service endpoint
    endpoint: String,
}

impl PmmlEngine {
    pub async fn new() -> Result<Self> {
        let endpoint = std::env::var("PMML_ENGINE_URL")
            .unwrap_or_else(|_| "http://localhost:50052".to_string());
        
        Ok(Self { endpoint })
    }
}

#[async_trait]
impl Engine for PmmlEngine {
    async fn execute(&self, rule: Rule, input: Value) -> Result<Value> {
        // Forward to R/PMML service via HTTP/gRPC
        let client = reqwest::Client::new();
        let response = client
            .post(format!("{}/execute", self.endpoint))
            .json(&serde_json::json!({
                "rule": rule,
                "input": input
            }))
            .send()
            .await
            .map_err(|e| EngineError::External(format!("PMML service error: {}", e)))?;
        
        let result: Value = response.json().await
            .map_err(|e| EngineError::External(format!("Invalid PMML response: {}", e)))?;
        
        Ok(result)
    }
    
    async fn is_healthy(&self) -> bool {
        match reqwest::get(format!("{}/health", self.endpoint)).await {
            Ok(resp) => resp.status().is_success(),
            Err(_) => false,
        }
    }
    
    fn supported_standards(&self) -> Vec<Standard> {
        vec![
            Standard::new("PMML", "4.4", "Predictive Model Markup Language"),
            Standard::new("DMG", "4.4", "Data Mining Group Standard"),
        ]
    }
    
    fn name(&self) -> &str {
        "pmml-engine"
    }
    
    fn version(&self) -> &str {
        "0.1.0"
    }
}
