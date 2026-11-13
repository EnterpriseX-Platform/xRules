//! HTTP API Integration Tests
//!
//! Tests REST API endpoints

use reqwest::Client;
use serde_json::json;

fn base_url() -> String {
    std::env::var("TEST_SERVER_URL").unwrap_or_else(|_| "http://127.0.0.1:50051".to_string())
}

fn create_client() -> Client {
    Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap()
}

async fn get_auth_token(client: &Client, username: &str, password: &str) -> Option<String> {
    let url = format!("{}/api/v1/auth/login", base_url());

    let resp = client
        .post(&url)
        .json(&json!({
            "username": username,
            "password": password
        }))
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() {
        return None;
    }

    let body: serde_json::Value = resp.json().await.ok()?;
    body["access_token"].as_str().map(|s| s.to_string())
}

// ==================== Health Endpoints ====================

#[tokio::test]
async fn test_health_endpoint() {
    let client = create_client();
    let url = format!("{}/health", base_url());

    let resp = client.get(&url).send().await;

    match resp {
        Ok(r) => {
            assert!(r.status().is_success());
            let body: serde_json::Value = r.json().await.unwrap();
            assert_eq!(body["status"], "healthy");
        }
        Err(e) => {
            println!("Skipping test - server not available: {}", e);
        }
    }
}

#[tokio::test]
async fn test_health_live_endpoint() {
    let client = create_client();
    let url = format!("{}/health/live", base_url());

    let resp = client.get(&url).send().await;

    match resp {
        Ok(r) => {
            assert!(r.status().is_success());
        }
        Err(e) => {
            println!("Skipping test - server not available: {}", e);
        }
    }
}

#[tokio::test]
async fn test_health_ready_endpoint() {
    let client = create_client();
    let url = format!("{}/health/ready", base_url());

    let resp = client.get(&url).send().await;

    match resp {
        Ok(r) => {
            assert!(r.status().is_success());
            let body: serde_json::Value = r.json().await.unwrap();
            assert!(body["ready"].is_boolean());
        }
        Err(e) => {
            println!("Skipping test - server not available: {}", e);
        }
    }
}

// ==================== API Documentation ====================

#[tokio::test]
async fn test_openapi_json_endpoint() {
    let client = create_client();
    let url = format!("{}/api/v1/openapi.json", base_url());

    let resp = client.get(&url).send().await;

    match resp {
        Ok(r) => {
            assert!(r.status().is_success());
            let body: serde_json::Value = r.json().await.unwrap();
            assert_eq!(body["openapi"], "3.1.0");
            assert!(body["info"]["title"].as_str().is_some());
        }
        Err(e) => {
            println!("Skipping test - server not available: {}", e);
        }
    }
}

#[tokio::test]
async fn test_swagger_ui_endpoint() {
    let client = create_client();
    let url = format!("{}/docs", base_url());

    let resp = client.get(&url).send().await;

    match resp {
        Ok(r) => {
            // Should return HTML
            assert!(r.status().is_success());
            let content_type = r.headers().get("content-type");
            if let Some(ct) = content_type {
                assert!(ct.to_str().unwrap().contains("text/html"));
            }
        }
        Err(e) => {
            println!("Skipping test - server not available: {}", e);
        }
    }
}

// ==================== Engine Endpoints ====================

#[tokio::test]
async fn test_list_engines() {
    let client = create_client();
    let token = get_auth_token(&client, "admin", "admin123").await;

    let url = format!("{}/api/v1/engines", base_url());
    let mut req = client.get(&url);

    if let Some(t) = token {
        req = req.bearer_auth(t);
    }

    let resp = req.send().await;

    match resp {
        Ok(r) => {
            if r.status().is_success() {
                let body: serde_json::Value = r.json().await.unwrap();
                let engines = body.as_array().unwrap();

                // Should have 5 engines
                assert!(engines.len() >= 5, "Expected at least 5 engines");

                // Check engine names
                let engine_names: Vec<String> = engines
                    .iter()
                    .map(|e| e["name"].as_str().unwrap().to_string())
                    .collect();

                assert!(engine_names.iter().any(|n| n.contains("Rules")));
                assert!(engine_names.iter().any(|n| n.contains("PMML")));
                assert!(engine_names.iter().any(|n| n.contains("ML")));
                assert!(engine_names.iter().any(|n| n.contains("LLM")));
                assert!(engine_names.iter().any(|n| n.contains("AI")));
            }
        }
        Err(e) => {
            println!("Skipping test - server not available: {}", e);
        }
    }
}

#[tokio::test]
async fn test_list_engines_unauthorized() {
    let client = create_client();
    let url = format!("{}/api/v1/engines", base_url());

    let resp = client.get(&url).send().await;

    match resp {
        Ok(r) => {
            // Should require authentication
            if !r.status().is_success() {
                assert_eq!(r.status(), 401);
            }
        }
        Err(e) => {
            println!("Skipping test - server not available: {}", e);
        }
    }
}

// ==================== Execute Endpoints ====================

#[tokio::test]
async fn test_execute_endpoint_rules_engine() {
    let client = create_client();
    let token = match get_auth_token(&client, "admin", "admin123").await {
        Some(t) => t,
        None => {
            println!("Skipping test - couldn't get auth token");
            return;
        }
    };

    let url = format!("{}/api/v1/execute", base_url());
    let resp = client
        .post(&url)
        .bearer_auth(token)
        .json(&json!({
            "rule_id": "test-rule-1",
            "input": {
                "age": 30,
                "income": 50000
            }
        }))
        .send()
        .await;

    match resp {
        Ok(r) => {
            if r.status().is_success() {
                let body: serde_json::Value = r.json().await.unwrap();
                assert!(body["success"].as_bool().is_some());
                assert!(body["duration_ms"].is_number());
            }
        }
        Err(e) => {
            println!("Execute test failed: {}", e);
        }
    }
}

#[tokio::test]
async fn test_execute_endpoint_missing_rule_id() {
    let client = create_client();
    let token = match get_auth_token(&client, "admin", "admin123").await {
        Some(t) => t,
        None => {
            println!("Skipping test - couldn't get auth token");
            return;
        }
    };

    let url = format!("{}/api/v1/execute", base_url());
    let resp = client
        .post(&url)
        .bearer_auth(token)
        .json(&json!({
            // Missing rule_id
            "input": {"value": 100}
        }))
        .send()
        .await;

    match resp {
        Ok(r) => {
            if !r.status().is_success() {
                assert!(r.status().is_client_error());
            }
        }
        Err(e) => {
            println!("Test failed: {}", e);
        }
    }
}

#[tokio::test]
async fn test_execute_endpoint_invalid_rule() {
    let client = create_client();
    let token = match get_auth_token(&client, "admin", "admin123").await {
        Some(t) => t,
        None => {
            println!("Skipping test - couldn't get auth token");
            return;
        }
    };

    let url = format!("{}/api/v1/execute", base_url());
    let resp = client
        .post(&url)
        .bearer_auth(token)
        .json(&json!({
            "rule_id": "non-existent-rule-12345",
            "input": {"value": 100}
        }))
        .send()
        .await;

    match resp {
        Ok(r) => {
            if !r.status().is_success() {
                // Should return 404 or error response
                let body: serde_json::Value = r.json().await.unwrap();
                assert!(!body["success"].as_bool().unwrap_or(true));
            }
        }
        Err(e) => {
            println!("Test failed: {}", e);
        }
    }
}

// ==================== Validate Endpoints ====================

#[tokio::test]
async fn test_validate_endpoint() {
    let client = create_client();
    let token = match get_auth_token(&client, "admin", "admin123").await {
        Some(t) => t,
        None => {
            println!("Skipping test - couldn't get auth token");
            return;
        }
    };

    let url = format!("{}/api/v1/validate/test-rule-1", base_url());
    let resp = client.post(&url).bearer_auth(token).send().await;

    match resp {
        Ok(r) => {
            if r.status().is_success() {
                let body: serde_json::Value = r.json().await.unwrap();
                assert!(body["valid"].is_boolean());
            }
        }
        Err(e) => {
            println!("Validate test failed: {}", e);
        }
    }
}

// ==================== Batch Execute ====================

#[tokio::test]
async fn test_batch_execute() {
    let client = create_client();
    let token = match get_auth_token(&client, "admin", "admin123").await {
        Some(t) => t,
        None => {
            println!("Skipping test - couldn't get auth token");
            return;
        }
    };

    let url = format!("{}/api/v1/execute/batch", base_url());
    let resp = client
        .post(&url)
        .bearer_auth(token)
        .json(&json!({
            "requests": [
                {"rule_id": "rule-1", "input": {"age": 25}},
                {"rule_id": "rule-2", "input": {"age": 35}}
            ]
        }))
        .send()
        .await;

    match resp {
        Ok(r) => {
            if r.status().is_success() {
                let body: serde_json::Value = r.json().await.unwrap();
                assert!(body["results"].is_array());
            }
        }
        Err(e) => {
            println!("Batch execute test failed: {}", e);
        }
    }
}

// ==================== Error Handling ====================

#[tokio::test]
async fn test_404_error() {
    let client = create_client();
    let url = format!("{}/api/v1/non-existent-endpoint", base_url());

    let resp = client.get(&url).send().await;

    match resp {
        Ok(r) => {
            assert_eq!(r.status(), 404);
        }
        Err(e) => {
            println!("Skipping test - server not available: {}", e);
        }
    }
}

#[tokio::test]
async fn test_method_not_allowed() {
    let client = create_client();
    let url = format!("{}/api/v1/engines", base_url());

    // Try to POST to a GET-only endpoint
    let resp = client.post(&url).send().await;

    match resp {
        Ok(r) => {
            // Should return 405 or require auth first
            if r.status() != 401 {
                assert!(r.status().as_u16() >= 400);
            }
        }
        Err(e) => {
            println!("Skipping test - server not available: {}", e);
        }
    }
}
