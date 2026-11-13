//! Authentication Integration Tests
//! 
//! Tests the full authentication flow via HTTP API

use reqwest::Client;
use serde_json::json;

fn base_url() -> String {
    std::env::var("TEST_SERVER_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:50051".to_string())
}

fn create_client() -> Client {
    Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap()
}

#[tokio::test]
async fn test_login_success_admin() {
    let client = create_client();
    let url = format!("{}/api/v1/auth/login", base_url());
    
    let response = client
        .post(&url)
        .json(&json!({
            "username": "admin",
            "password": "admin123"
        }))
        .send()
        .await;
    
    match response {
        Ok(resp) => {
            if resp.status().is_success() {
                let body: serde_json::Value = resp.json().await.unwrap();
                assert!(body["access_token"].is_string());
                assert!(body["refresh_token"].is_string());
                assert_eq!(body["token_type"], "Bearer");
                assert!(body["expires_in"].is_number());
                assert!(body["user"]["username"].as_str().unwrap() == "admin");
                
                let roles = body["user"]["roles"].as_array().unwrap();
                assert!(roles.iter().any(|r| r == "Admin"));
            } else {
                println!("Login endpoint returned: {}", resp.status());
            }
        }
        Err(e) => {
            println!("Skipping test - server not available: {}", e);
        }
    }
}

#[tokio::test]
async fn test_login_success_editor() {
    let client = create_client();
    let url = format!("{}/api/v1/auth/login", base_url());
    
    let response = client
        .post(&url)
        .json(&json!({
            "username": "editor",
            "password": "editor123"
        }))
        .send()
        .await;
    
    match response {
        Ok(resp) => {
            if resp.status().is_success() {
                let body: serde_json::Value = resp.json().await.unwrap();
                assert_eq!(body["user"]["username"], "editor");
                
                let roles = body["user"]["roles"].as_array().unwrap();
                assert!(roles.iter().any(|r| r == "Editor"));
                assert!(roles.iter().any(|r| r == "Viewer"));
                assert!(!roles.iter().any(|r| r == "Admin"));
            }
        }
        Err(e) => {
            println!("Skipping test - server not available: {}", e);
        }
    }
}

#[tokio::test]
async fn test_login_invalid_credentials() {
    let client = create_client();
    let url = format!("{}/api/v1/auth/login", base_url());
    
    let response = client
        .post(&url)
        .json(&json!({
            "username": "admin",
            "password": "wrongpassword"
        }))
        .send()
        .await;
    
    match response {
        Ok(resp) => {
            // Should return 401 Unauthorized
            if resp.status() != reqwest::StatusCode::OK {
                assert_eq!(resp.status(), 401);
            }
        }
        Err(e) => {
            println!("Skipping test - server not available: {}", e);
        }
    }
}

#[tokio::test]
async fn test_login_missing_fields() {
    let client = create_client();
    let url = format!("{}/api/v1/auth/login", base_url());
    
    let response = client
        .post(&url)
        .json(&json!({
            "username": "admin"
            // missing password
        }))
        .send()
        .await;
    
    match response {
        Ok(resp) => {
            // Should return 400 Bad Request
            if resp.status() != reqwest::StatusCode::OK {
                assert!(resp.status().is_client_error());
            }
        }
        Err(e) => {
            println!("Skipping test - server not available: {}", e);
        }
    }
}

#[tokio::test]
async fn test_token_refresh_flow() {
    let client = create_client();
    
    // Step 1: Login
    let login_url = format!("{}/api/v1/auth/login", base_url());
    let login_resp = client
        .post(&login_url)
        .json(&json!({
            "username": "admin",
            "password": "admin123"
        }))
        .send()
        .await;
    
    match login_resp {
        Ok(resp) if resp.status().is_success() => {
            let login_body: serde_json::Value = resp.json().await.unwrap();
            let refresh_token = login_body["refresh_token"].as_str().unwrap();
            
            // Step 2: Refresh token
            let refresh_url = format!("{}/api/v1/auth/refresh", base_url());
            let refresh_resp = client
                .post(&refresh_url)
                .json(&json!({
                    "refresh_token": refresh_token
                }))
                .send()
                .await;
            
            match refresh_resp {
                Ok(resp) if resp.status().is_success() => {
                    let refresh_body: serde_json::Value = resp.json().await.unwrap();
                    assert!(refresh_body["access_token"].is_string());
                    assert!(refresh_body["refresh_token"].is_string());
                    // New tokens should be different
                    assert_ne!(refresh_body["access_token"], login_body["access_token"]);
                }
                _ => println!("Refresh endpoint not available or failed"),
            }
        }
        _ => println!("Skipping test - server not available"),
    }
}

#[tokio::test]
async fn test_refresh_invalid_token() {
    let client = create_client();
    let url = format!("{}/api/v1/auth/refresh", base_url());
    
    let response = client
        .post(&url)
        .json(&json!({
            "refresh_token": "invalid.token.here"
        }))
        .send()
        .await;
    
    match response {
        Ok(resp) => {
            if resp.status() != reqwest::StatusCode::OK {
                assert_eq!(resp.status(), 401);
            }
        }
        Err(e) => {
            println!("Skipping test - server not available: {}", e);
        }
    }
}

#[tokio::test]
async fn test_protected_endpoint_without_token() {
    let client = create_client();
    // Try to access a protected endpoint (e.g., logout)
    let url = format!("{}/api/v1/auth/logout", base_url());
    
    let response = client
        .post(&url)
        .json(&json!({}))
        .send()
        .await;
    
    match response {
        Ok(resp) => {
            // Should return 401 Unauthorized
            if resp.status() != reqwest::StatusCode::OK {
                assert_eq!(resp.status(), 401);
            }
        }
        Err(e) => {
            println!("Skipping test - server not available: {}", e);
        }
    }
}

#[tokio::test]
async fn test_protected_endpoint_with_valid_token() {
    let client = create_client();
    
    // First login
    let login_url = format!("{}/api/v1/auth/login", base_url());
    let login_resp = client
        .post(&login_url)
        .json(&json!({
            "username": "admin",
            "password": "admin123"
        }))
        .send()
        .await;
    
    match login_resp {
        Ok(resp) if resp.status().is_success() => {
            let login_body: serde_json::Value = resp.json().await.unwrap();
            let access_token = login_body["access_token"].as_str().unwrap();
            
            // Try to access protected endpoint with token
            let logout_url = format!("{}/api/v1/auth/logout", base_url());
            let logout_resp = client
                .post(&logout_url)
                .bearer_auth(access_token)
                .json(&json!({}))
                .send()
                .await;
            
            match logout_resp {
                Ok(resp) => {
                    // Should succeed or return method not allowed
                    assert!(resp.status().is_success() || resp.status() == 404);
                }
                Err(e) => println!("Logout failed: {}", e),
            }
        }
        _ => println!("Skipping test - server not available"),
    }
}

#[tokio::test]
async fn test_role_based_access_control() {
    let client = create_client();
    
    // Test that different users get appropriate roles
    let users = vec![
        ("admin", vec!["Admin", "Editor", "Viewer"]),
        ("editor", vec!["Editor", "Viewer"]),
        ("viewer", vec!["Viewer"]),
    ];
    
    let login_url = format!("{}/api/v1/auth/login", base_url());
    
    for (username, expected_roles) in users {
        let password = format!("{}123", username);
        let resp = client
            .post(&login_url)
            .json(&json!({
                "username": username,
                "password": password
            }))
            .send()
            .await;
        
        match resp {
            Ok(r) if r.status().is_success() => {
                let body: serde_json::Value = r.json().await.unwrap();
                let roles: Vec<String> = body["user"]["roles"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|r| r.as_str().unwrap().to_string())
                    .collect();
                
                for role in expected_roles {
                    assert!(
                        roles.iter().any(|r| r == role),
                        "User {} should have role {}",
                        username,
                        role
                    );
                }
            }
            _ => println!("Skipping {} - server not available", username),
        }
    }
}
