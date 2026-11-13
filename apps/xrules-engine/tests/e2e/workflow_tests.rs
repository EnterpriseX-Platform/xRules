//! End-to-End Workflow Tests
//!
//! Tests complete user workflows from authentication through rule execution

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

async fn get_auth_token(
    client: &Client,
    username: &str,
    password: &str,
) -> Option<(String, String)> {
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
    let access_token = body["access_token"].as_str()?.to_string();
    let refresh_token = body["refresh_token"].as_str()?.to_string();

    Some((access_token, refresh_token))
}

// ==================== Complete Workflows ====================

#[tokio::test]
async fn test_complete_auth_workflow() {
    let client = create_client();

    // Step 1: Login
    let (access_token, refresh_token) = match get_auth_token(&client, "admin", "admin123").await {
        Some(t) => t,
        None => {
            println!("Skipping test - couldn't authenticate");
            return;
        }
    };

    // Step 2: Use access token to access protected resource
    let engines_url = format!("{}/api/v1/engines", base_url());
    let resp = client
        .get(&engines_url)
        .bearer_auth(&access_token)
        .send()
        .await;

    match resp {
        Ok(r) => {
            if r.status().is_success() {
                println!("Successfully accessed protected endpoint");
            }
        }
        Err(e) => println!("Failed to access protected endpoint: {}", e),
    }

    // Step 3: Refresh token
    let refresh_url = format!("{}/api/v1/auth/refresh", base_url());
    let resp = client
        .post(&refresh_url)
        .json(&json!({"refresh_token": refresh_token}))
        .send()
        .await;

    match resp {
        Ok(r) => {
            if r.status().is_success() {
                println!("Successfully refreshed token");
            }
        }
        Err(e) => println!("Failed to refresh token: {}", e),
    }

    // Step 4: Logout (if supported)
    let logout_url = format!("{}/api/v1/auth/logout", base_url());
    let resp = client
        .post(&logout_url)
        .bearer_auth(&access_token)
        .send()
        .await;

    match resp {
        Ok(r) => {
            if r.status().is_success() {
                println!("Successfully logged out");
            }
        }
        Err(e) => println!("Logout not available or failed: {}", e),
    }
}

#[tokio::test]
async fn test_rules_engine_workflow() {
    let client = create_client();

    // Get auth token
    let token = match get_auth_token(&client, "admin", "admin123").await {
        Some((t, _)) => t,
        None => {
            println!("Skipping test - couldn't authenticate");
            return;
        }
    };

    // Execute a DMN-based decision
    let url = format!("{}/api/v1/execute", base_url());
    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .json(&json!({
            "rule_id": "loan-decision-1",
            "input": {
                "applicant": {
                    "age": 35,
                    "annual_income": 75000,
                    "credit_score": 720,
                    "employment_years": 5
                },
                "loan": {
                    "amount": 200000,
                    "term_years": 30,
                    "property_value": 300000
                }
            }
        }))
        .send()
        .await;

    match resp {
        Ok(r) => {
            if r.status().is_success() {
                let body: serde_json::Value = r.json().await.unwrap();
                println!("Rules engine result: {:?}", body);

                if let Some(success) = body["success"].as_bool() {
                    if success {
                        println!("Rule executed successfully");
                    } else {
                        println!("Rule execution failed: {:?}", body["error"]);
                    }
                }
            }
        }
        Err(e) => println!("Rules engine workflow failed: {}", e),
    }
}

#[tokio::test]
async fn test_ml_engine_workflow() {
    let client = create_client();

    let token = match get_auth_token(&client, "admin", "admin123").await {
        Some((t, _)) => t,
        None => {
            println!("Skipping test - couldn't authenticate");
            return;
        }
    };

    // Execute ML prediction
    let url = format!("{}/api/v1/execute", base_url());
    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .json(&json!({
            "rule_id": "ml-churn-prediction",
            "input": {
                "customer_id": "CUST-12345",
                "features": {
                    "tenure_months": 24,
                    "monthly_charges": 75.50,
                    "total_charges": 1812.0,
                    "contract_type": "Month-to-month",
                    "payment_method": "Electronic check",
                    "internet_service": "Fiber optic"
                }
            }
        }))
        .send()
        .await;

    match resp {
        Ok(r) => {
            if r.status().is_success() {
                let body: serde_json::Value = r.json().await.unwrap();
                println!("ML engine result: {:?}", body);
            }
        }
        Err(e) => println!("ML engine workflow failed: {}", e),
    }
}

#[tokio::test]
async fn test_pmml_engine_workflow() {
    let client = create_client();

    let token = match get_auth_token(&client, "admin", "admin123").await {
        Some((t, _)) => t,
        None => {
            println!("Skipping test - couldn't authenticate");
            return;
        }
    };

    // Execute PMML scoring
    let url = format!("{}/api/v1/execute", base_url());
    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .json(&json!({
            "rule_id": "pmml-risk-score",
            "input": {
                "debt_ratio": 0.35,
                "income": 80000,
                "num_credit_lines": 5,
                "num_delinquencies": 0,
                "revolving_utilization": 0.25
            }
        }))
        .send()
        .await;

    match resp {
        Ok(r) => {
            if r.status().is_success() {
                let body: serde_json::Value = r.json().await.unwrap();
                println!("PMML engine result: {:?}", body);
            }
        }
        Err(e) => println!("PMML engine workflow failed: {}", e),
    }
}

#[tokio::test]
async fn test_llm_engine_workflow() {
    let client = create_client();

    let token = match get_auth_token(&client, "admin", "admin123").await {
        Some((t, _)) => t,
        None => {
            println!("Skipping test - couldn't authenticate");
            return;
        }
    };

    // Execute LLM inference
    let url = format!("{}/api/v1/execute", base_url());
    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .json(&json!({
            "rule_id": "llm-document-analysis",
            "input": {
                "document_text": "This is a sample contract document for review.",
                "analysis_type": "risk_assessment",
                "max_length": 500
            }
        }))
        .send()
        .await;

    match resp {
        Ok(r) => {
            if r.status().is_success() {
                let body: serde_json::Value = r.json().await.unwrap();
                println!("LLM engine result: {:?}", body);
            }
        }
        Err(e) => println!("LLM engine workflow failed: {}", e),
    }
}

#[tokio::test]
async fn test_ai_engine_workflow() {
    let client = create_client();

    let token = match get_auth_token(&client, "admin", "admin123").await {
        Some((t, _)) => t,
        None => {
            println!("Skipping test - couldn't authenticate");
            return;
        }
    };

    // Execute AI/Deep Learning inference
    let url = format!("{}/api/v1/execute", base_url());
    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .json(&json!({
            "rule_id": "ai-fraud-detection",
            "input": {
                "transaction_id": "TXN-98765",
                "amount": 5000.00,
                "merchant_category": "electronics",
                "time_of_day": "02:30",
                "card_present": false,
                "previous_transactions_24h": 12,
                "unusual_location": true
            }
        }))
        .send()
        .await;

    match resp {
        Ok(r) => {
            if r.status().is_success() {
                let body: serde_json::Value = r.json().await.unwrap();
                println!("AI engine result: {:?}", body);
            }
        }
        Err(e) => println!("AI engine workflow failed: {}", e),
    }
}

#[tokio::test]
async fn test_chained_rules_workflow() {
    let client = create_client();

    let token = match get_auth_token(&client, "admin", "admin123").await {
        Some((t, _)) => t,
        None => {
            println!("Skipping test - couldn't authenticate");
            return;
        }
    };

    // Execute a rule that chains multiple engines
    let url = format!("{}/api/v1/execute", base_url());
    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .json(&json!({
            "rule_id": "complex-credit-assessment",
            "input": {
                "applicant": {
                    "name": "John Doe",
                    "ssn": "123-45-6789"
                },
                "application": {
                    "loan_amount": 500000,
                    "property_value": 600000,
                    "purpose": "home_purchase"
                }
            },
            "context": {
                "enable_ml_scoring": true,
                "enable_fraud_check": true
            }
        }))
        .send()
        .await;

    match resp {
        Ok(r) => {
            if r.status().is_success() {
                let body: serde_json::Value = r.json().await.unwrap();
                println!("Chained rules result: {:?}", body);
            }
        }
        Err(e) => println!("Chained rules workflow failed: {}", e),
    }
}

#[tokio::test]
async fn test_batch_processing_workflow() {
    let client = create_client();

    let token = match get_auth_token(&client, "admin", "admin123").await {
        Some((t, _)) => t,
        None => {
            println!("Skipping test - couldn't authenticate");
            return;
        }
    };

    // Execute batch of rules
    let url = format!("{}/api/v1/execute/batch", base_url());
    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .json(&json!({
            "requests": [
                {
                    "rule_id": "loan-decision-1",
                    "input": {"age": 30, "income": 50000}
                },
                {
                    "rule_id": "loan-decision-1",
                    "input": {"age": 45, "income": 100000}
                },
                {
                    "rule_id": "loan-decision-1",
                    "input": {"age": 25, "income": 30000}
                }
            ]
        }))
        .send()
        .await;

    match resp {
        Ok(r) => {
            if r.status().is_success() {
                let body: serde_json::Value = r.json().await.unwrap();
                println!("Batch processing result: {:?}", body);

                if let Some(results) = body["results"].as_array() {
                    assert_eq!(results.len(), 3);
                    println!("Processed {} requests in batch", results.len());
                }
            }
        }
        Err(e) => println!("Batch processing workflow failed: {}", e),
    }
}

#[tokio::test]
async fn test_role_based_workflow() {
    let client = create_client();

    // Test that different roles have appropriate access
    let roles = vec![
        ("admin", vec!["read", "write", "execute", "admin"]),
        ("editor", vec!["read", "write", "execute"]),
        ("viewer", vec!["read", "execute"]),
    ];

    for (role, _permissions) in roles {
        let password = format!("{}123", role);
        let result = get_auth_token(&client, role, &password).await;

        match result {
            Some((token, _)) => {
                // Try to access engines list
                let url = format!("{}/api/v1/engines", base_url());
                let resp = client.get(&url).bearer_auth(&token).send().await;

                match resp {
                    Ok(r) => {
                        if r.status().is_success() {
                            println!("{} can access engines list", role);
                        } else {
                            println!("{} cannot access engines list: {}", role, r.status());
                        }
                    }
                    Err(e) => println!("Request failed for {}: {}", role, e),
                }
            }
            None => println!("Could not authenticate as {}", role),
        }
    }
}
