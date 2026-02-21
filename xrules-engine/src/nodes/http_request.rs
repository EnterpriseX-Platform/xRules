use async_trait::async_trait;
use serde_json::json;
use std::time::Duration;

use crate::engine::NodeExecutor;
use crate::models::{ExecutionContext, ExecutionError, Node, NodeOutput, NodeType};

/// Executor for HTTP request nodes
pub struct HttpExecutor {
    client: reqwest::Client,
}

impl HttpExecutor {
    pub fn new(client: reqwest::Client) -> Self {
        Self { client }
    }
    
    pub fn default_client() -> reqwest::Client {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .pool_max_idle_per_host(10)
            .build()
            .expect("Failed to build HTTP client")
    }
    
    async fn execute_internal(
        &self,
        node: &Node,
        context: &mut ExecutionContext,
    ) -> Result<NodeOutput, ExecutionError> {
        // Get URL
        let url = node.data
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ExecutionError::node_error(
                &node.id,
                "HTTP node must have a 'url' field"
            ))?;
        
        // Process URL variables
        let url = self.replace_variables(url, context);
        
        // Get HTTP method
        let method = node.data
            .get("method")
            .and_then(|v| v.as_str())
            .unwrap_or("GET")
            .to_uppercase();
        
        context.log_info(&node.id, format!("Sending {} request to {}", method, url));
        
        // Build request
        let mut request_builder = match method.as_str() {
            "GET" => self.client.get(&url),
            "POST" => self.client.post(&url),
            "PUT" => self.client.put(&url),
            "PATCH" => self.client.patch(&url),
            "DELETE" => self.client.delete(&url),
            "HEAD" => self.client.head(&url),
            _ => {
                return Err(ExecutionError::node_error(
                    &node.id,
                    format!("Unsupported HTTP method: {}", method)
                ));
            }
        };
        
        // Add headers
        if let Some(headers) = node.data.get("headers").and_then(|v| v.as_object()) {
            for (key, value) in headers {
                if let Some(val_str) = value.as_str() {
                    let processed_val = self.replace_variables(val_str, context);
                    request_builder = request_builder.header(key, processed_val);
                }
            }
        }
        
        // Add authentication
        if let Some(auth) = node.data.get("auth") {
            request_builder = self.apply_auth(request_builder, auth, context)?;
        }
        
        // Add body for POST/PUT/PATCH
        if ["POST", "PUT", "PATCH"].contains(&method.as_str()) {
            if let Some(body) = node.data.get("body") {
                let body = self.process_body(body, context)?;
                request_builder = request_builder.body(body);
                
                // Set content type if not already set
                if !node.data.get("headers")
                    .and_then(|v| v.get("Content-Type"))
                    .is_some()
                {
                    request_builder = request_builder.header("Content-Type", "application/json");
                }
            }
        }
        
        // Set timeout if specified
        if let Some(timeout_secs) = node.data.get("timeout").and_then(|v| v.as_u64()) {
            request_builder = request_builder.timeout(Duration::from_secs(timeout_secs));
        }
        
        // Execute request with retry logic
        let max_retries = node.data.get("retry").and_then(|v| v.as_u64()).unwrap_or(0);
        let mut last_error = None;
        
        for attempt in 0..=max_retries {
            if attempt > 0 {
                context.log_info(&node.id, format!("Retry attempt {} after error", attempt));
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
            
            match request_builder.try_clone().ok_or_else(|| {
                ExecutionError::node_error(&node.id, "Cannot clone request for retry")
            })?.send().await {
                Ok(response) => {
                    return self.process_response(node, response, context).await;
                }
                Err(e) => {
                    context.log_error(&node.id, format!("HTTP request error: {}", e));
                    last_error = Some(e);
                }
            }
        }
        
        Err(ExecutionError::external_error(
            format!("HTTP request failed after {} retries: {:?}", max_retries, last_error)
        ))
    }
    
    fn apply_auth(
        &self,
        builder: reqwest::RequestBuilder,
        auth: &serde_json::Value,
        context: &ExecutionContext,
    ) -> Result<reqwest::RequestBuilder, ExecutionError> {
        let auth_type = auth.get("type").and_then(|v| v.as_str()).unwrap_or("none");
        
        match auth_type {
            "basic" => {
                let username = auth.get("username")
                    .and_then(|v| v.as_str())
                    .map(|s| self.replace_variables(s, context))
                    .unwrap_or_default();
                let password = auth.get("password")
                    .and_then(|v| v.as_str())
                    .map(|s| self.replace_variables(s, context))
                    .unwrap_or_default();
                Ok(builder.basic_auth(username, Some(password)))
            }
            "bearer" => {
                let token = auth.get("token")
                    .and_then(|v| v.as_str())
                    .map(|s| self.replace_variables(s, context))
                    .unwrap_or_default();
                Ok(builder.bearer_auth(token))
            }
            "apikey" => {
                let key = auth.get("key")
                    .and_then(|v| v.as_str())
                    .map(|s| self.replace_variables(s, context))
                    .unwrap_or_default();
                let header = auth.get("header")
                    .and_then(|v| v.as_str())
                    .unwrap_or("X-API-Key");
                Ok(builder.header(header, key))
            }
            _ => Ok(builder),
        }
    }
    
    fn process_body(
        &self,
        body: &serde_json::Value,
        context: &ExecutionContext,
    ) -> Result<String, ExecutionError> {
        match body {
            serde_json::Value::String(s) => {
                // Template string - replace variables
                Ok(self.replace_variables(s, context))
            }
            _ => {
                // JSON body - replace variables in the JSON
                let processed = self.replace_variables_in_json(body.clone(), context);
                serde_json::to_string(&processed)
                    .map_err(|e| ExecutionError::transform_error(format!("JSON serialization error: {}", e)))
            }
        }
    }
    
    async fn process_response(
        &self,
        node: &Node,
        response: reqwest::Response,
        context: &mut ExecutionContext,
    ) -> Result<NodeOutput, ExecutionError> {
        let status = response.status();
        let headers = response.headers().clone();
        
        context.log_info(&node.id, format!("HTTP response status: {}", status));
        
        // Get response body
        let body_text = response.text().await
            .map_err(|e| ExecutionError::external_error(format!("Failed to read response body: {}", e)))?;
        
        // Try to parse as JSON
        let body_json: serde_json::Value = serde_json::from_str(&body_text)
            .unwrap_or_else(|_| serde_json::json!(body_text));
        
        // Check if response is successful
        let success = status.is_success();
        
        // Build result
        let mut result = json!({
            "status": status.as_u16(),
            "success": success,
            "body": body_json,
        });
        
        // Add headers if requested
        if node.data.get("includeHeaders").and_then(|v| v.as_bool()).unwrap_or(false) {
            let headers_map: serde_json::Map<String, serde_json::Value> = headers
                .iter()
                .filter_map(|(k, v)| {
                    v.to_str().ok().map(|val| (k.to_string(), json!(val)))
                })
                .collect();
            if let serde_json::Value::Object(ref mut obj) = result {
                obj.insert("headers".to_string(), serde_json::Value::Object(headers_map));
            }
        }
        
        // Handle error responses
        if !success {
            let error_on_fail = node.data.get("errorOnFail")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            
            if error_on_fail {
                return Err(ExecutionError::external_error(
                    format!("HTTP request failed with status {}: {:?}", status, body_json)
                ));
            }
        }
        
        // Store result in context
        context.set_variable(format!("{}_response", node.id), result.clone());
        context.set_variable("http_response", result.clone());
        
        Ok(NodeOutput::new(result))
    }
    
    fn replace_variables(&self, template: &str, context: &ExecutionContext) -> String {
        let mut result = template.to_string();
        
        // Replace {{variable}} syntax
        for (key, value) in &context.variables {
            let placeholder = format!("{{{{{}}}}}", key);
            let replacement = match value {
                serde_json::Value::String(s) => s.clone(),
                v => v.to_string(),
            };
            result = result.replace(&placeholder, &replacement);
        }
        
        // Replace ${variable} syntax
        for (key, value) in &context.variables {
            let placeholder = format!("${{{}}}", key);
            let replacement = match value {
                serde_json::Value::String(s) => s.clone(),
                v => v.to_string(),
            };
            result = result.replace(&placeholder, &replacement);
        }
        
        result
    }
    
    fn replace_variables_in_json(
        &self,
        value: serde_json::Value,
        context: &ExecutionContext,
    ) -> serde_json::Value {
        match value {
            serde_json::Value::String(s) => {
                serde_json::json!(self.replace_variables(&s, context))
            }
            serde_json::Value::Object(map) => {
                let mut new_map = serde_json::Map::new();
                for (k, v) in map {
                    new_map.insert(k, self.replace_variables_in_json(v, context));
                }
                serde_json::Value::Object(new_map)
            }
            serde_json::Value::Array(arr) => {
                serde_json::Value::Array(
                    arr.into_iter()
                        .map(|v| self.replace_variables_in_json(v, context))
                        .collect()
                )
            }
            other => other,
        }
    }
}

#[async_trait]
impl NodeExecutor for HttpExecutor {
    async fn execute(
        &self,
        node: &Node,
        context: &mut ExecutionContext,
    ) -> Result<NodeOutput, ExecutionError> {
        self.execute_internal(node, context).await
    }
    
    fn node_type(&self) -> NodeType {
        NodeType::HttpRequest
    }
}

impl Default for HttpExecutor {
    fn default() -> Self {
        Self::new(Self::default_client())
    }
}
