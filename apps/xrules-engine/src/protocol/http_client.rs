// HTTP Client for external engine communication
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub struct EngineHttpClient {
    client: Client,
    base_url: String,
}

impl EngineHttpClient {
    pub fn new(base_url: &str) -> Self {
        Self {
            client: Client::new(),
            base_url: base_url.to_string(),
        }
    }

    pub async fn execute(&self, rule: Value, input: Value) -> Result<Value, reqwest::Error> {
        let response = self
            .client
            .post(format!("{}/execute", self.base_url))
            .json(&serde_json::json!({
                "rule": rule,
                "input": input
            }))
            .send()
            .await?;

        response.json::<Value>().await
    }

    pub async fn health_check(&self) -> Result<bool, reqwest::Error> {
        let response = self
            .client
            .get(format!("{}/health", self.base_url))
            .send()
            .await?;

        Ok(response.status().is_success())
    }
}
