use crate::engines::rules::context::ExecutionContext;
use crate::engines::rules::nodes::types::NodeExecutor;
use crate::engines::EngineError;
use crate::engines::rules::Result;
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;

/// SubflowNode calls an existing flow rule via the Studio Backend's /execute endpoint.
/// Similar to RuleRefNode but specifically for WORKFLOW type rules.
pub struct SubflowNode {
    backend_url: String,
}

impl SubflowNode {
    pub fn new(backend_url: String) -> Self {
        Self { backend_url }
    }
}

#[derive(Debug, Deserialize)]
struct SubflowConfig {
    flow_rule_id: String,
    #[serde(default)]
    input_mapping: HashMap<String, String>,
}

impl NodeExecutor for SubflowNode {
    fn execute<'a>(
        &'a self,
        config: &'a Value,
        context: &'a mut ExecutionContext,
    ) -> Pin<Box<dyn Future<Output = Result<Value>> + Send + 'a>> {
        Box::pin(async move {
            let cfg: SubflowConfig = serde_json::from_value(config.clone())
                .map_err(|e| EngineError::Validation(format!("Invalid subflow config: {}", e)))?;

            // Build subflow input from mapping or use parent input
            let subflow_input = if cfg.input_mapping.is_empty() {
                context.input.clone()
            } else {
                let mut mapped = serde_json::Map::new();
                for (target, source) in &cfg.input_mapping {
                    let val = context.input.get(source).cloned()
                        .or_else(|| context.variables.get(source).cloned())
                        .unwrap_or(Value::Null);
                    mapped.insert(target.clone(), val);
                }
                Value::Object(mapped)
            };

            // Call Studio Backend /execute with the flow rule
            let client = reqwest::Client::new();
            let response = client
                .post(format!("{}/execute", self.backend_url))
                .json(&serde_json::json!({
                    "rule_id": cfg.flow_rule_id,
                    "input": subflow_input,
                }))
                .timeout(std::time::Duration::from_secs(60))
                .send()
                .await
                .map_err(|e| EngineError::External(format!("Subflow call failed: {}", e)))?;

            let body: Value = response.json().await
                .map_err(|e| EngineError::External(format!("Subflow response parse failed: {}", e)))?;

            if let Some(data) = body.get("data") {
                if let Some(output) = data.get("output") {
                    return Ok(output.clone());
                }
                return Ok(data.clone());
            }
            Ok(body)
        })
    }
}
