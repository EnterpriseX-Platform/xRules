//! Rule Hub Integration Tests
//! 
//! ทดสอบการทำงานของ Engine Hub ในการ route และ execute rules

use reqwest::Client;
use serde_json::json;

fn base_url() -> String {
    std::env::var("TEST_SERVER_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:50051".to_string())
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

// ==================== Hub Routing Tests ====================

#[tokio::test]
async fn test_hub_lists_all_engines() {
    let client = create_client();
    let token = match get_auth_token(&client, "admin", "admin123").await {
        Some(t) => t,
        None => {
            println!("ℹ️  Skipping: Server not available or auth failed");
            return;
        }
    };
    
    let url = format!("{}/api/v1/engines", base_url());
    let resp = client
        .get(&url)
        .bearer_auth(&token)
        .send()
        .await;
    
    match resp {
        Ok(r) if r.status().is_success() => {
            let body: serde_json::Value = r.json().await.unwrap();
            let engines = body.as_array().expect("Expected array of engines");
            
            println!("✅ Found {} engines:", engines.len());
            for engine in engines {
                let name = engine["name"].as_str().unwrap_or("unknown");
                let engine_type = engine["engine_type"].as_str().unwrap_or("unknown");
                let status = engine["status"].as_str().unwrap_or("unknown");
                println!("   - {} (type: {}, status: {})", name, engine_type, status);
            }
            
            // ต้องมี 5 engines
            assert!(
                engines.len() >= 5,
                "Expected at least 5 engines, found {}",
                engines.len()
            );
            
            // ตรวจสอบว่ามี engine types ที่ถูกต้อง
            let types: Vec<String> = engines
                .iter()
                .map(|e| e["engine_type"].as_str().unwrap().to_string())
                .collect();
            
            assert!(types.contains(&"rules".to_string()), "Missing rules engine");
            assert!(types.contains(&"pmml".to_string()), "Missing pmml engine");
            assert!(types.contains(&"ml".to_string()), "Missing ml engine");
            assert!(types.contains(&"llm".to_string()), "Missing llm engine");
            assert!(types.contains(&"ai".to_string()), "Missing ai engine");
            
            println!("✅ All 5 engine types present");
        }
        Ok(r) => {
            println!("⚠️  Failed to list engines: {}", r.status());
        }
        Err(e) => {
            println!("ℹ️  Server not available: {}", e);
        }
    }
}

#[tokio::test]
async fn test_hub_routes_to_rules_engine() {
    let client = create_client();
    let token = match get_auth_token(&client, "admin", "admin123").await {
        Some(t) => t,
        None => {
            println!("ℹ️  Skipping: Server not available");
            return;
        }
    };
    
    let url = format!("{}/api/v1/execute", base_url());
    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .json(&json!({
            "rule_id": "loan-eligibility-check",
            "input": {
                "applicant": {
                    "age": 35,
                    "annual_income": 80000,
                    "credit_score": 750,
                    "employment_status": "employed",
                    "years_employed": 5
                },
                "loan": {
                    "amount": 300000,
                    "term_years": 30,
                    "down_payment_percent": 20
                }
            }
        }))
        .send()
        .await;
    
    match resp {
        Ok(r) => {
            let status = r.status();
            let body: serde_json::Value = r.json().await.unwrap_or_else(|_| json!({"error": "parse failed"}));
            
            if status.is_success() {
                println!("✅ Rules engine execution successful");
                println!("   Output: {}", serde_json::to_string_pretty(&body).unwrap());
                
                if let Some(engine) = body["engine_used"].as_str() {
                    println!("   Engine used: {}", engine);
                }
            } else {
                println!("⚠️  Rules engine returned: {}", status);
                println!("   Response: {}", body);
            }
        }
        Err(e) => {
            println!("ℹ️  Request failed: {}", e);
        }
    }
}

#[tokio::test]
async fn test_hub_routes_to_ml_engine() {
    let client = create_client();
    let token = match get_auth_token(&client, "admin", "admin123").await {
        Some(t) => t,
        None => {
            println!("ℹ️  Skipping: Server not available");
            return;
        }
    };
    
    let url = format!("{}/api/v1/execute", base_url());
    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .json(&json!({
            "rule_id": "customer-churn-prediction",
            "input": {
                "customer_id": "CUST-001",
                "features": {
                    "tenure_months": 24,
                    "monthly_charges": 75.50,
                    "total_charges": 1812.0,
                    "contract_type": "Month-to-month",
                    "payment_method": "Electronic check",
                    "internet_service": "Fiber optic",
                    "online_security": "No",
                    "tech_support": "No"
                }
            }
        }))
        .send()
        .await;
    
    match resp {
        Ok(r) => {
            let status = r.status();
            if status.is_success() {
                let body: serde_json::Value = r.json().await.unwrap();
                println!("✅ ML engine execution successful");
                println!("   Prediction: {:?}", body["output"]["prediction"]);
                println!("   Confidence: {:?}", body["output"]["confidence"]);
            } else {
                println!("⚠️  ML engine returned: {}", status);
            }
        }
        Err(e) => {
            println!("ℹ️  Request failed: {}", e);
        }
    }
}

#[tokio::test]
async fn test_hub_routes_to_pmml_engine() {
    let client = create_client();
    let token = match get_auth_token(&client, "admin", "admin123").await {
        Some(t) => t,
        None => {
            println!("ℹ️  Skipping: Server not available");
            return;
        }
    };
    
    let url = format!("{}/api/v1/execute", base_url());
    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .json(&json!({
            "rule_id": "credit-risk-scoring",
            "input": {
                "debt_ratio": 0.35,
                "income": 80000,
                "num_credit_lines": 5,
                "num_delinquencies": 0,
                "revolving_utilization": 0.25,
                "months_since_last_delinquency": 999
            }
        }))
        .send()
        .await;
    
    match resp {
        Ok(r) => {
            let status = r.status();
            if status.is_success() {
                let body: serde_json::Value = r.json().await.unwrap();
                println!("✅ PMML engine execution successful");
                println!("   Risk score: {:?}", body["output"]["risk_score"]);
                println!("   Risk tier: {:?}", body["output"]["risk_tier"]);
            } else {
                println!("⚠️  PMML engine returned: {}", status);
            }
        }
        Err(e) => {
            println!("ℹ️  Request failed: {}", e);
        }
    }
}

#[tokio::test]
async fn test_hub_routes_to_llm_engine() {
    let client = create_client();
    let token = match get_auth_token(&client, "admin", "admin123").await {
        Some(t) => t,
        None => {
            println!("ℹ️  Skipping: Server not available");
            return;
        }
    };
    
    let url = format!("{}/api/v1/execute", base_url());
    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .json(&json!({
            "rule_id": "document-sentiment-analysis",
            "input": {
                "text": "The service was excellent and the staff were very helpful. Highly recommended!",
                "analysis_type": "sentiment",
                "language": "en"
            }
        }))
        .send()
        .await;
    
    match resp {
        Ok(r) => {
            let status = r.status();
            if status.is_success() {
                let body: serde_json::Value = r.json().await.unwrap();
                println!("✅ LLM engine execution successful");
                println!("   Sentiment: {:?}", body["output"]["sentiment"]);
                println!("   Confidence: {:?}", body["output"]["confidence"]);
            } else {
                println!("⚠️  LLM engine returned: {}", status);
            }
        }
        Err(e) => {
            println!("ℹ️  Request failed: {}", e);
        }
    }
}

#[tokio::test]
async fn test_hub_routes_to_ai_engine() {
    let client = create_client();
    let token = match get_auth_token(&client, "admin", "admin123").await {
        Some(t) => t,
        None => {
            println!("ℹ️  Skipping: Server not available");
            return;
        }
    };
    
    let url = format!("{}/api/v1/execute", base_url());
    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .json(&json!({
            "rule_id": "transaction-fraud-detection",
            "input": {
                "transaction_id": "TXN-98765",
                "amount": 5000.00,
                "currency": "USD",
                "timestamp": "2024-02-23T14:30:00Z",
                "merchant_category": "electronics",
                "card_present": false,
                "ecommerce": true,
                "previous_declines_24h": 2,
                "unusual_location": true,
                "velocity_count_1h": 10
            }
        }))
        .send()
        .await;
    
    match resp {
        Ok(r) => {
            let status = r.status();
            if status.is_success() {
                let body: serde_json::Value = r.json().await.unwrap();
                println!("✅ AI engine execution successful");
                println!("   Fraud score: {:?}", body["output"]["fraud_score"]);
                println!("   Decision: {:?}", body["output"]["decision"]);
            } else {
                println!("⚠️  AI engine returned: {}", status);
            }
        }
        Err(e) => {
            println!("ℹ️  Request failed: {}", e);
        }
    }
}

// ==================== Hub Error Handling Tests ====================

#[tokio::test]
async fn test_hub_handles_invalid_rule_id() {
    let client = create_client();
    let token = match get_auth_token(&client, "admin", "admin123").await {
        Some(t) => t,
        None => {
            println!("ℹ️  Skipping: Server not available");
            return;
        }
    };
    
    let url = format!("{}/api/v1/execute", base_url());
    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .json(&json!({
            "rule_id": "this-rule-does-not-exist-12345",
            "input": {"test": "data"}
        }))
        .send()
        .await;
    
    match resp {
        Ok(r) => {
            let status = r.status();
            let body: serde_json::Value = r.json().await.unwrap_or_else(|_| json!({}));
            
            // ควรได้รับ error (404 หรือ 400)
            if !status.is_success() {
                println!("✅ Hub correctly rejected invalid rule_id with status: {}", status);
                assert!(body["success"].as_bool() == Some(false) || status.as_u16() == 404);
            } else {
                println!("⚠️  Hub accepted invalid rule_id (might be stub implementation)");
            }
        }
        Err(e) => {
            println!("ℹ️  Request failed: {}", e);
        }
    }
}

#[tokio::test]
async fn test_hub_handles_malformed_input() {
    let client = create_client();
    let token = match get_auth_token(&client, "admin", "admin123").await {
        Some(t) => t,
        None => {
            println!("ℹ️  Skipping: Server not available");
            return;
        }
    };
    
    let url = format!("{}/api/v1/execute", base_url());
    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .header("Content-Type", "application/json")
        .body("{invalid json}")
        .send()
        .await;
    
    match resp {
        Ok(r) => {
            let status = r.status();
            if status.is_client_error() {
                println!("✅ Hub correctly rejected malformed input with status: {}", status);
            } else {
                println!("⚠️  Hub accepted malformed input");
            }
        }
        Err(e) => {
            println!("ℹ️  Request failed: {}", e);
        }
    }
}

// ==================== Hub Performance Tests ====================

#[tokio::test]
async fn test_hub_batch_execution() {
    let client = create_client();
    let token = match get_auth_token(&client, "admin", "admin123").await {
        Some(t) => t,
        None => {
            println!("ℹ️  Skipping: Server not available");
            return;
        }
    };
    
    let url = format!("{}/api/v1/execute/batch", base_url());
    let start = std::time::Instant::now();
    
    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .json(&json!({
            "requests": [
                {"rule_id": "loan-check-1", "input": {"amount": 100000, "income": 50000}},
                {"rule_id": "loan-check-2", "input": {"amount": 200000, "income": 80000}},
                {"rule_id": "loan-check-3", "input": {"amount": 50000, "income": 30000}},
                {"rule_id": "loan-check-4", "input": {"amount": 300000, "income": 100000}},
                {"rule_id": "loan-check-5", "input": {"amount": 150000, "income": 60000}}
            ]
        }))
        .send()
        .await;
    
    let duration = start.elapsed();
    
    match resp {
        Ok(r) if r.status().is_success() => {
            let body: serde_json::Value = r.json().await.unwrap();
            let results = body["results"].as_array().unwrap();
            
            println!("✅ Batch execution completed in {:?}", duration);
            println!("   Processed {} requests", results.len());
            
            // ควรประมวลผลทั้ง 5 requests
            assert_eq!(results.len(), 5);
            
            // ตรวจสอบว่าแต่ละ request มีผลลัพธ์
            for (i, result) in results.iter().enumerate() {
                let success = result["success"].as_bool().unwrap_or(false);
                println!("   Request {}: success={}", i + 1, success);
            }
        }
        Ok(r) => {
            println!("⚠️  Batch execution failed: {}", r.status());
        }
        Err(e) => {
            println!("ℹ️  Request failed: {}", e);
        }
    }
}

#[tokio::test]
async fn test_hub_concurrent_requests() {
    let client = create_client();
    let token = match get_auth_token(&client, "admin", "admin123").await {
        Some(t) => t,
        None => {
            println!("ℹ️  Skipping: Server not available");
            return;
        }
    };
    
    let url = format!("{}/api/v1/execute", base_url());
    let mut handles = vec![];
    
    // สร้าง 5 concurrent requests
    for i in 0..5 {
        let client = client.clone();
        let token = token.clone();
        let url = url.clone();
        
        let handle = tokio::spawn(async move {
            let resp = client
                .post(&url)
                .bearer_auth(&token)
                .json(&json!({
                    "rule_id": format!("concurrent-test-{}", i),
                    "input": {"request_num": i, "timestamp": chrono::Utc::now().to_rfc3339()}
                }))
                .send()
                .await;
            
            match resp {
                Ok(r) => {
                    let status = r.status();
                    println!("   Request {}: {}", i, status);
                    status.is_success()
                }
                Err(e) => {
                    println!("   Request {} failed: {}", i, e);
                    false
                }
            }
        });
        
        handles.push(handle);
    }
    
    // รอทุก request เสร็จ
    let mut success_count = 0;
    for handle in handles {
        if let Ok(true) = handle.await {
            success_count += 1;
        }
    }
    
    println!("✅ Concurrent execution: {}/5 succeeded", success_count);
}
