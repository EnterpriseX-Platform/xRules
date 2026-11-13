use crate::engines::rules::context::ExecutionContext;
use crate::engines::rules::nodes::types::NodeExecutor;
use crate::engines::EngineError;
use crate::engines::rules::Result;
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;

/// MlModelNode calls the ML engine (Python FastAPI) for predictions.
pub struct MlModelNode;

#[derive(Debug, Deserialize)]
struct MlModelConfig {
    #[serde(default = "default_ml_endpoint")]
    endpoint: String,
    #[serde(default)]
    model_id: String,
    #[serde(default)]
    feature_mapping: HashMap<String, String>,
}

fn default_ml_endpoint() -> String {
    std::env::var("ML_ENGINE_URL").unwrap_or_else(|_| "http://localhost:50053".to_string())
}

impl NodeExecutor for MlModelNode {
    fn execute<'a>(
        &'a self,
        config: &'a Value,
        context: &'a mut ExecutionContext,
    ) -> Pin<Box<dyn Future<Output = Result<Value>> + Send + 'a>> {
        Box::pin(async move {
            let cfg: MlModelConfig = serde_json::from_value(config.clone())
                .map_err(|e| EngineError::Validation(format!("Invalid mlModel config: {}", e)))?;

            // Build features from input using mapping
            let features = if cfg.feature_mapping.is_empty() {
                context.input.clone()
            } else {
                let mut mapped = serde_json::Map::new();
                for (target, source) in &cfg.feature_mapping {
                    let val = context.input.get(source).cloned().unwrap_or(Value::Null);
                    mapped.insert(target.clone(), val);
                }
                Value::Object(mapped)
            };

            let client = reqwest::Client::new();
            let response = client
                .post(format!("{}/execute", cfg.endpoint))
                .json(&serde_json::json!({
                    "rule": {
                        "definition": {
                            "model_id": cfg.model_id,
                        }
                    },
                    "input": features,
                }))
                .timeout(std::time::Duration::from_secs(60))
                .send()
                .await
                .map_err(|e| EngineError::External(format!("ML engine call failed: {}", e)))?;

            let body: Value = response.json().await
                .map_err(|e| EngineError::External(format!("ML response parse failed: {}", e)))?;

            if let Some(output) = body.get("output") {
                return Ok(output.clone());
            }
            Ok(body)
        })
    }
}
