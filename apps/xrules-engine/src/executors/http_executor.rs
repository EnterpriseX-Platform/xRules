use async_trait::async_trait;
use reqwest::{Client, Response};
use std::sync::Arc;
use std::time::Duration;

use crate::executors::ConnectionPool;
use crate::models::{ExecutionError, HttpConfig};

/// HTTP connection pool wrapper
pub struct HttpConnectionPool {
    config: HttpConfig,
    client: Client,
}

impl HttpConnectionPool {
    pub fn new(config: HttpConfig) -> Self {
        let client = Self::build_client(&config);
        
        Self { config, client }
    }
    
    fn build_client(config: &HttpConfig) -> Client {
        let mut builder = Client::builder()
            .timeout(Duration::from_secs(config.timeout_seconds.unwrap_or(30)));
        
        // Add default headers
        if let Some(headers) = &config.headers {
            let mut header_map = reqwest::header::HeaderMap::new();
            for (key, value) in headers {
                if let Ok(header_name) = key.parse::<reqwest::header::HeaderName>() {
                    if let Ok(header_value) = value.parse::<reqwest::header::HeaderValue>() {
                        header_map.insert(header_name, header_value);
                    }
                }
            }
            builder = builder.default_headers(header_map);
        }
        
        // SSL verification
        if let Some(false) = config.verify_ssl {
            builder = builder.danger_accept_invalid_certs(true);
        }
        
        builder.build().expect("Failed to build HTTP client")
    }
    
    pub fn get_client(&self) -> &Client {
        &self.client
    }
    
    pub async fn request(
        &self,
        method: reqwest::Method,
        path: &str,
        body: Option<serde_json::Value>,
    ) -> Result<Response, ExecutionError> {
        let url = format!("{}{}", self.config.base_url.trim_end_matches('/'), path);
        
        let mut request = self.client.request(method, &url);
        
        // Add authentication
        request = self.apply_auth(request);
        
        // Add body
        if let Some(body) = body {
            request = request.json(&body);
        }
        
        let response = request.send().await
            .map_err(|e| ExecutionError::external_error(format!("HTTP request failed: {}", e)))?;
        
        Ok(response)
    }
    
    pub async fn get(&self, path: &str) -> Result<Response, ExecutionError> {
        self.request(reqwest::Method::GET, path, None).await
    }
    
    pub async fn post(&self, path: &str, body: serde_json::Value) -> Result<Response, ExecutionError> {
        self.request(reqwest::Method::POST, path, Some(body)).await
    }
    
    pub async fn put(&self, path: &str, body: serde_json::Value) -> Result<Response, ExecutionError> {
        self.request(reqwest::Method::PUT, path, Some(body)).await
    }
    
    pub async fn patch(&self, path: &str, body: serde_json::Value) -> Result<Response, ExecutionError> {
        self.request(reqwest::Method::PATCH, path, Some(body)).await
    }
    
    pub async fn delete(&self, path: &str) -> Result<Response, ExecutionError> {
        self.request(reqwest::Method::DELETE, path, None).await
    }
    
    fn apply_auth(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match self.config.auth_type {
            Some(crate::models::AuthType::Basic) => {
                if let (Some(username), Some(password)) = (&self.config.username, &self.config.password) {
                    request.basic_auth(username, Some(password))
                } else {
                    request
                }
            }
            Some(crate::models::AuthType::Bearer) => {
                if let Some(token) = &self.config.token {
                    request.bearer_auth(token)
                } else {
                    request
                }
            }
            Some(crate::models::AuthType::ApiKey) => {
                if let (Some(key), Some(header)) = (&self.config.api_key, &self.config.api_key_header) {
                    request.header(header, key)
                } else {
                    request
                }
            }
            _ => request,
        }
    }
}

#[async_trait]
impl ConnectionPool<Client> for HttpConnectionPool {
    async fn get_connection(&self, _name: &str) -> Result<Arc<Client>, ExecutionError> {
        Ok(Arc::new(self.client.clone()))
    }
    
    async fn add_connection(&self, _name: String, _connection: crate::models::Connection) -> Result<(), ExecutionError> {
        Ok(())
    }
    
    async fn remove_connection(&self, _name: &str) -> Result<(), ExecutionError> {
        Ok(())
    }
    
    async fn test_connection(&self, _name: &str) -> Result<bool, ExecutionError> {
        match self.get("/").await {
            Ok(_) | Err(_) => Ok(true), // Always return true for HTTP
        }
    }
    
    fn list_connections(&self) -> Vec<String> {
        vec![self.config.base_url.clone()]
    }
}
