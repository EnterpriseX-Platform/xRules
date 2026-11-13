use crate::engines::{Engine, EngineError, Result};
use crate::hub::router::Rule;
use crate::hub::types::Standard;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::{error, info};

/// PMML Engine client for R-based statistical models
pub struct PmmlEngine {
    /// R service endpoint
    endpoint: String,
    /// HTTP client
    client: reqwest::Client,
}

impl PmmlEngine {
    pub async fn new() -> Result<Self> {
        let endpoint = std::env::var("PMML_ENGINE_URL")
            .unwrap_or_else(|_| "http://localhost:50052".to_string());

        info!(
            "Initializing PMML Engine client with endpoint: {}",
            endpoint
        );

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .map_err(|e| EngineError::External(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self { endpoint, client })
    }

    /// Load a PMML model from file path
    pub async fn load_model(&self, model_path: &str) -> Result<String> {
        let url = format!("{}/models/load", self.endpoint);

        let response = self
            .client
            .post(&url)
            .json(&serde_json::json!({
                "model_path": model_path
            }))
            .send()
            .await
            .map_err(|e| EngineError::External(format!("PMML service error: {}", e)))?;

        let result: LoadModelResponse = response
            .json()
            .await
            .map_err(|e| EngineError::External(format!("Invalid response: {}", e)))?;

        if result.success {
            Ok(result.model_id)
        } else {
            Err(EngineError::External(result.error.unwrap_or_default()))
        }
    }

    /// Validate PMML content
    pub async fn validate_pmml(&self, pmml_content: &str) -> Result<bool> {
        let url = format!("{}/validate", self.endpoint);

        let response = self
            .client
            .post(&url)
            .json(&serde_json::json!({
                "pmml_content": pmml_content
            }))
            .send()
            .await
            .map_err(|e| EngineError::External(format!("PMML validation error: {}", e)))?;

        let result: ValidateResponse = response
            .json()
            .await
            .map_err(|e| EngineError::External(format!("Invalid response: {}", e)))?;

        Ok(result.valid)
    }
}

#[async_trait]
impl Engine for PmmlEngine {
    async fn execute(&self, rule: Rule, input: Value) -> Result<Value> {
        info!("PMML Engine executing rule: {}", rule.id);

        let url = format!("{}/execute", self.endpoint);

        let request = ExecuteRequest {
            rule: RuleInfo {
                id: rule.id,
                definition: rule.definition,
            },
            input,
        };

        let response = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| EngineError::External(format!("PMML service error: {}", e)))?;

        let result: ExecuteResponse = response
            .json()
            .await
            .map_err(|e| EngineError::External(format!("Invalid PMML response: {}", e)))?;

        if result.success {
            info!("PMML model executed successfully");
            Ok(result.output.unwrap_or(Value::Null))
        } else {
            error!(
                "PMML execution failed: {}",
                result.error.as_deref().unwrap_or("Unknown error")
            );
            Err(EngineError::Execution(result.error.unwrap_or_default()))
        }
    }

    async fn is_healthy(&self) -> bool {
        match self
            .client
            .get(format!("{}/health", self.endpoint))
            .send()
            .await
        {
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

// Request/Response structs
#[derive(Debug, Serialize)]
struct ExecuteRequest {
    rule: RuleInfo,
    input: Value,
}

#[derive(Debug, Serialize)]
struct RuleInfo {
    id: String,
    definition: Value,
}

#[derive(Debug, Deserialize)]
struct ExecuteResponse {
    success: bool,
    output: Option<Value>,
    error: Option<String>,
    #[allow(dead_code)]
    duration_ms: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct LoadModelResponse {
    success: bool,
    model_id: String,
    #[allow(dead_code)]
    model_type: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ValidateResponse {
    valid: bool,
    #[allow(dead_code)]
    errors: Option<Vec<String>>,
}
