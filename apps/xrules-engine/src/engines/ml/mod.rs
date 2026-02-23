use crate::engines::{Engine, EngineError, Result};
use crate::hub::router::Rule;
use crate::hub::types::Standard;
use async_trait::async_trait;
use serde_json::Value;

pub struct MlEngine {
    // Python ML service endpoint
    endpoint: String,
}

impl MlEngine {
    pub async fn new() -> Result<Self> {
        let endpoint = std::env::var("ML_ENGINE_URL")
            .unwrap_or_else(|_| "http://localhost:50053".to_string());
        
        Ok(Self { endpoint })
    }
}

#[async_trait]
impl Engine for MlEngine {
    async fn execute(&self, rule: Rule, input: Value) -> Result<Value> {
        // Forward to Python ML service
        let client = reqwest::Client::new();
        let response = client
            .post(format!("{}/predict", self.endpoint))
            .json(&serde_json::json!({
                "model_path": rule.definition.get("model_path"),
                "input": input
            }))
            .send()
            .await
            .map_err(|e| EngineError::External(format!("ML service error: {}", e)))?;
        
        let result: Value = response.json().await
            .map_err(|e| EngineError::External(format!("Invalid ML response: {}", e)))?;
        
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
            Standard::new("ONNX", "1.14", "Open Neural Network Exchange"),
            Standard::new("Pickle", "4.0", "Python Model Serialization"),
            Standard::new("Joblib", "1.3", "Scikit-learn Model Format"),
        ]
    }
    
    fn name(&self) -> &str {
        "ml-engine"
    }
    
    fn version(&self) -> &str {
        "0.1.0"
    }
}
