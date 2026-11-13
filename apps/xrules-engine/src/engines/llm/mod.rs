use crate::engines::{Engine, EngineError, Result};
use crate::hub::router::Rule;
use crate::hub::types::Standard;
use async_trait::async_trait;
use serde_json::Value;

pub struct LlmEngine {
    // Python LLM service endpoint
    endpoint: String,
}

impl LlmEngine {
    pub async fn new() -> Result<Self> {
        let endpoint = std::env::var("LLM_ENGINE_URL")
            .unwrap_or_else(|_| "http://localhost:50054".to_string());

        Ok(Self { endpoint })
    }
}

#[async_trait]
impl Engine for LlmEngine {
    async fn execute(&self, rule: Rule, input: Value) -> Result<Value> {
        // Forward to Python LLM service
        let client = reqwest::Client::new();
        let response = client
            .post(format!("{}/generate", self.endpoint))
            .json(&serde_json::json!({
                "provider": rule.definition.get("llm_provider"),
                "model": rule.definition.get("model"),
                "prompt": input.get("prompt"),
                "temperature": rule.definition.get("temperature").unwrap_or(&Value::from(0.7)),
                "max_tokens": rule.definition.get("max_tokens").unwrap_or(&Value::from(1000)),
            }))
            .send()
            .await
            .map_err(|e| EngineError::External(format!("LLM service error: {}", e)))?;

        let result: Value = response
            .json()
            .await
            .map_err(|e| EngineError::External(format!("Invalid LLM response: {}", e)))?;

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
            Standard::new("OpenAI API", "v1", "OpenAI-compatible API"),
            Standard::new("Anthropic", "2023-06-01", "Claude API"),
            Standard::new("Ollama", "0.1", "Local LLM API"),
        ]
    }

    fn name(&self) -> &str {
        "llm-engine"
    }

    fn version(&self) -> &str {
        "0.1.0"
    }
}
