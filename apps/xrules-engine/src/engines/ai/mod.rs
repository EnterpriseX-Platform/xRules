use crate::engines::{Engine, EngineError, Result};
use crate::hub::router::Rule;
use crate::hub::types::Standard;
use async_trait::async_trait;
use serde_json::Value;

pub struct AiEngine {
    // Python AI/Deep Learning service endpoint
    endpoint: String,
}

impl AiEngine {
    pub async fn new() -> Result<Self> {
        let endpoint =
            std::env::var("AI_ENGINE_URL").unwrap_or_else(|_| "http://localhost:50055".to_string());

        Ok(Self { endpoint })
    }
}

#[async_trait]
impl Engine for AiEngine {
    async fn execute(&self, rule: Rule, input: Value) -> Result<Value> {
        // Forward to Python AI service
        let client = reqwest::Client::new();
        let response = client
            .post(format!("{}/inference", self.endpoint))
            .json(&serde_json::json!({
                "framework": rule.definition.get("framework"), // tensorflow, pytorch, etc.
                "model_path": rule.definition.get("model_path"),
                "input": input
            }))
            .send()
            .await
            .map_err(|e| EngineError::External(format!("AI service error: {}", e)))?;

        let result: Value = response
            .json()
            .await
            .map_err(|e| EngineError::External(format!("Invalid AI response: {}", e)))?;

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
            Standard::new("TensorFlow", "2.x", "TensorFlow SavedModel"),
            Standard::new("PyTorch", "2.x", "PyTorch TorchScript"),
            Standard::new("HuggingFace", "4.x", "Transformers Pipeline"),
        ]
    }

    fn name(&self) -> &str {
        "ai-engine"
    }

    fn version(&self) -> &str {
        "0.1.0"
    }
}
