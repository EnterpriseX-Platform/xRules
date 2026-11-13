use crate::engines::rules::context::ExecutionContext;
use crate::engines::rules::nodes::types::NodeExecutor;
use crate::engines::rules::Result;
use crate::engines::EngineError;
use serde::Deserialize;
use serde_json::Value;
use std::future::Future;
use std::pin::Pin;

pub struct HttpNode;

#[derive(Debug, Deserialize)]
struct HttpConfig {
    method: String,
    url: String,
    #[serde(default)]
    #[allow(dead_code)]
    headers: Value,
    #[serde(default)]
    body: Value,
}

impl NodeExecutor for HttpNode {
    fn execute<'a>(
        &'a self,
        config: &'a Value,
        _context: &'a mut ExecutionContext,
    ) -> Pin<Box<dyn Future<Output = Result<Value>> + Send + 'a>> {
        Box::pin(async move {
            let cfg: HttpConfig = serde_json::from_value(config.clone())
                .map_err(|e| EngineError::Validation(format!("Invalid HTTP config: {}", e)))?;

            let client = reqwest::Client::new();
            let method = cfg.method.to_uppercase();

            let request = match method.as_str() {
                "GET" => client.get(&cfg.url),
                "POST" => client.post(&cfg.url).json(&cfg.body),
                "PUT" => client.put(&cfg.url).json(&cfg.body),
                "PATCH" => client.patch(&cfg.url).json(&cfg.body),
                "DELETE" => client.delete(&cfg.url),
                _ => {
                    return Err(EngineError::Validation(format!(
                        "Unsupported method: {}",
                        method
                    )))
                }
            };

            let response = request
                .send()
                .await
                .map_err(|e| EngineError::External(e.to_string()))?;

            let status = response.status();
            let body: Value = response.json::<Value>().await.unwrap_or(Value::Null);

            Ok(serde_json::json!({
                "status": status.as_u16(),
                "body": body
            }))
        })
    }
}
