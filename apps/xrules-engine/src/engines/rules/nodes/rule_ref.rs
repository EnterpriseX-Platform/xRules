use crate::engines::rules::context::ExecutionContext;
use crate::engines::rules::nodes::types::NodeExecutor;
use crate::engines::rules::Result;
use crate::engines::EngineError;
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;

/// RuleRefNode calls an existing rule via the Studio Backend's /execute endpoint.
/// This allows flow designers to reference Decision Tables, Formulas, etc. as nodes.
pub struct RuleRefNode {
    backend_url: String,
}

impl RuleRefNode {
    pub fn new(backend_url: String) -> Self {
        Self { backend_url }
    }
}

#[derive(Debug, Deserialize)]
struct RuleRefConfig {
    rule_id: String,
    #[serde(default)]
    input_mapping: HashMap<String, String>,
}

impl NodeExecutor for RuleRefNode {
    fn execute<'a>(
        &'a self,
        config: &'a Value,
        context: &'a mut ExecutionContext,
    ) -> Pin<Box<dyn Future<Output = Result<Value>> + Send + 'a>> {
        Box::pin(async move {
            let cfg: RuleRefConfig = serde_json::from_value(config.clone())
                .map_err(|e| EngineError::Validation(format!("Invalid ruleRef config: {}", e)))?;

            // Build input: either use mapping or pass through context input
            let input = if cfg.input_mapping.is_empty() {
                context.input.clone()
            } else {
                let mut mapped = serde_json::Map::new();
                for (target_key, source_path) in &cfg.input_mapping {
                    let value = resolve_path(&context.input, &context.variables, source_path);
                    mapped.insert(target_key.clone(), value);
                }
                Value::Object(mapped)
            };

            // Call Studio Backend /execute
            let client = reqwest::Client::new();
            let response = client
                .post(format!("{}/execute", self.backend_url))
                .json(&serde_json::json!({
                    "rule_id": cfg.rule_id,
                    "input": input,
                }))
                .timeout(std::time::Duration::from_secs(30))
                .send()
                .await
                .map_err(|e| EngineError::External(format!("RuleRef call failed: {}", e)))?;

            let body: Value = response.json().await.map_err(|e| {
                EngineError::External(format!("RuleRef response parse failed: {}", e))
            })?;

            // Extract output from backend response: { success, data: { output: ... } }
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

/// Resolve a dotted path from input or context variables
fn resolve_path(input: &Value, variables: &HashMap<String, Value>, path: &str) -> Value {
    // Try context variables first (e.g., "node-1.result")
    let parts: Vec<&str> = path.splitn(2, '.').collect();
    if parts.len() == 2 {
        if let Some(var) = variables.get(parts[0]) {
            if let Some(val) = var.get(parts[1]) {
                return val.clone();
            }
        }
    }
    // Try from variables directly
    if let Some(val) = variables.get(path) {
        return val.clone();
    }
    // Fall back to input
    if let Some(val) = input.get(path) {
        return val.clone();
    }
    Value::Null
}
