use crate::engines::rules::context::ExecutionContext;
use crate::engines::rules::nodes::types::NodeExecutor;
use crate::engines::EngineError;
use crate::engines::rules::Result;
use serde::Deserialize;
use serde_json::Value;
use std::future::Future;
use std::pin::Pin;

/// LlmPromptNode calls the LLM engine (Python FastAPI) for text generation.
/// Supports prompt templating with Handlebars syntax referencing context variables.
pub struct LlmPromptNode;

#[derive(Debug, Deserialize)]
struct LlmPromptConfig {
    #[serde(default = "default_llm_endpoint")]
    endpoint: String,
    #[serde(default = "default_provider")]
    provider: String,
    #[serde(default = "default_model")]
    model: String,
    prompt: String,
    #[serde(default)]
    system_prompt: Option<String>,
    #[serde(default = "default_temperature")]
    temperature: f64,
    #[serde(default = "default_max_tokens")]
    max_tokens: u32,
}

fn default_llm_endpoint() -> String {
    std::env::var("LLM_ENGINE_URL").unwrap_or_else(|_| "http://localhost:50054".to_string())
}
fn default_provider() -> String { "openai".to_string() }
fn default_model() -> String { "gpt-4".to_string() }
fn default_temperature() -> f64 { 0.7 }
fn default_max_tokens() -> u32 { 1000 }

impl NodeExecutor for LlmPromptNode {
    fn execute<'a>(
        &'a self,
        config: &'a Value,
        context: &'a mut ExecutionContext,
    ) -> Pin<Box<dyn Future<Output = Result<Value>> + Send + 'a>> {
        Box::pin(async move {
            let cfg: LlmPromptConfig = serde_json::from_value(config.clone())
                .map_err(|e| EngineError::Validation(format!("Invalid llmPrompt config: {}", e)))?;

            // Simple template rendering: replace {{key}} with context values
            let rendered_prompt = render_template(&cfg.prompt, &context.input, &context.variables);

            let mut request_body = serde_json::json!({
                "provider": cfg.provider,
                "model": cfg.model,
                "prompt": rendered_prompt,
                "temperature": cfg.temperature,
                "max_tokens": cfg.max_tokens,
            });

            if let Some(sys) = &cfg.system_prompt {
                request_body["system_message"] = Value::String(sys.clone());
            }

            let client = reqwest::Client::new();
            let response = client
                .post(format!("{}/generate", cfg.endpoint))
                .json(&request_body)
                .timeout(std::time::Duration::from_secs(120))
                .send()
                .await
                .map_err(|e| EngineError::External(format!("LLM engine call failed: {}", e)))?;

            let body: Value = response.json().await
                .map_err(|e| EngineError::External(format!("LLM response parse failed: {}", e)))?;

            // Return the generated text and metadata
            Ok(serde_json::json!({
                "text": body.get("text").cloned().unwrap_or(Value::Null),
                "tokens_used": body.get("tokens_used").cloned().unwrap_or(Value::Null),
                "provider": cfg.provider,
                "model": cfg.model,
            }))
        })
    }
}

/// Simple Handlebars-like template renderer: replaces {{key}} with values from input/variables
fn render_template(
    template: &str,
    input: &Value,
    variables: &std::collections::HashMap<String, Value>,
) -> String {
    let mut result = template.to_string();

    // Replace {{input.key}} patterns
    if let Some(obj) = input.as_object() {
        for (key, val) in obj {
            let placeholder = format!("{{{{input.{}}}}}", key);
            let replacement = match val {
                Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            result = result.replace(&placeholder, &replacement);
        }
    }

    // Replace {{nodeId.key}} patterns from variables
    for (node_id, val) in variables {
        if let Some(obj) = val.as_object() {
            for (key, v) in obj {
                let placeholder = format!("{{{{{}.{}}}}}", node_id, key);
                let replacement = match v {
                    Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                result = result.replace(&placeholder, &replacement);
            }
        }
        // Also replace {{nodeId}} directly
        let placeholder = format!("{{{{{}}}}}", node_id);
        let replacement = match val {
            Value::String(s) => s.clone(),
            other => other.to_string(),
        };
        result = result.replace(&placeholder, &replacement);
    }

    result
}
