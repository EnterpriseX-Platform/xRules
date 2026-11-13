//! Engine Unit Tests

use serde_json::json;
use xrules_engine::engines::EngineError;

#[test]
fn test_engine_error_execution() {
    let err = EngineError::Execution("Something went wrong".to_string());
    assert_eq!(err.to_string(), "Execution error: Something went wrong");
}

#[test]
fn test_engine_error_validation() {
    let err = EngineError::Validation("Invalid rule format".to_string());
    assert_eq!(err.to_string(), "Validation error: Invalid rule format");
}

#[test]
fn test_engine_error_not_implemented() {
    let err = EngineError::NotImplemented;
    assert_eq!(err.to_string(), "Not implemented");
}

#[test]
fn test_engine_error_external() {
    let err = EngineError::External("External service timeout".to_string());
    assert_eq!(
        err.to_string(),
        "External service error: External service timeout"
    );
}

// Test that EngineError can be converted to HubError
#[test]
fn test_engine_error_conversion() {
    use xrules_engine::hub::HubError;

    let engine_err = EngineError::Execution("Test error".to_string());
    let hub_err: HubError = engine_err.into();

    match hub_err {
        HubError::EngineError(msg) => {
            assert!(msg.contains("Test error"));
        }
        _ => panic!("Expected EngineError variant"),
    }
}

// Test node types from rules engine
#[test]
fn test_dmn_table_evaluation() {
    // Test simple DMN-like decision table logic
    let input = json!({
        "age": 35,
        "income": 60000,
        "credit_score": 750
    });

    // Simulate a decision table evaluation
    let decision = evaluate_loan_decision(&input);

    assert_eq!(decision["decision"], "approved");
    assert_eq!(decision["interest_rate"], 3.5);
}

#[test]
fn test_dmn_table_evaluation_declined() {
    let input = json!({
        "age": 25,
        "income": 20000,
        "credit_score": 500
    });

    let decision = evaluate_loan_decision(&input);

    assert_eq!(decision["decision"], "declined");
}

fn evaluate_loan_decision(input: &serde_json::Value) -> serde_json::Value {
    let _age = input["age"].as_i64().unwrap_or(0);
    let income = input["income"].as_i64().unwrap_or(0);
    let credit_score = input["credit_score"].as_i64().unwrap_or(0);

    // Simple decision table logic
    if credit_score >= 700 && income >= 50000 {
        json!({
            "decision": "approved",
            "interest_rate": 3.5,
            "max_loan_amount": income * 5
        })
    } else if credit_score >= 600 && income >= 30000 {
        json!({
            "decision": "approved",
            "interest_rate": 5.5,
            "max_loan_amount": income * 3
        })
    } else {
        json!({
            "decision": "declined",
            "reason": "Insufficient credit score or income"
        })
    }
}

// Test JSON transformation logic
#[test]
fn test_json_transformation() {
    let input = json!({
        "firstName": "John",
        "lastName": "Doe",
        "age": 30,
        "email": "john.doe@example.com"
    });

    let transformed = transform_customer_data(&input);

    assert_eq!(transformed["full_name"], "John Doe");
    assert_eq!(transformed["is_adult"], true);
    assert_eq!(transformed["email_domain"], "example.com");
}

#[test]
fn test_json_transformation_minor() {
    let input = json!({
        "firstName": "Jane",
        "lastName": "Smith",
        "age": 16,
        "email": "jane@school.edu"
    });

    let transformed = transform_customer_data(&input);

    assert_eq!(transformed["is_adult"], false);
}

fn transform_customer_data(input: &serde_json::Value) -> serde_json::Value {
    let first_name = input["firstName"].as_str().unwrap_or("");
    let last_name = input["lastName"].as_str().unwrap_or("");
    let age = input["age"].as_i64().unwrap_or(0);
    let email = input["email"].as_str().unwrap_or("");

    // Extract email domain
    let domain = email.split('@').nth(1).unwrap_or("").to_string();

    json!({
        "full_name": format!("{} {}", first_name, last_name),
        "is_adult": age >= 18,
        "age": age,
        "email_domain": domain
    })
}

// Test condition evaluation
#[test]
fn test_condition_evaluation() {
    let context = json!({
        "temperature": 25,
        "humidity": 60,
        "weather": "sunny"
    });

    // Test various conditions
    assert!(evaluate_condition(&context, "temperature > 20"));
    assert!(evaluate_condition(&context, "humidity >= 50"));
    assert!(evaluate_condition(&context, "weather == 'sunny'"));
    assert!(!evaluate_condition(&context, "temperature < 0"));
}

fn evaluate_condition(context: &serde_json::Value, condition: &str) -> bool {
    // Simple condition parser for testing
    let parts: Vec<&str> = condition.split_whitespace().collect();
    if parts.len() != 3 {
        return false;
    }

    let field = parts[0];
    let operator = parts[1];
    let value_str = parts[2].trim_matches('\'');

    let field_value = &context[field];

    match operator {
        ">" => {
            let field_num = field_value.as_i64().unwrap_or(0);
            let val_num = value_str.parse::<i64>().unwrap_or(0);
            field_num > val_num
        }
        ">=" => {
            let field_num = field_value.as_i64().unwrap_or(0);
            let val_num = value_str.parse::<i64>().unwrap_or(0);
            field_num >= val_num
        }
        "<" => {
            let field_num = field_value.as_i64().unwrap_or(0);
            let val_num = value_str.parse::<i64>().unwrap_or(0);
            field_num < val_num
        }
        "==" => field_value
            .as_str()
            .map(|s| s == value_str)
            .unwrap_or(false),
        _ => false,
    }
}

// Test PMML-like scoring
#[test]
fn test_pmml_regression_scoring() {
    let model = LinearRegressionModel {
        intercept: 10.0,
        coefficients: vec![
            ("feature1".to_string(), 2.5),
            ("feature2".to_string(), -1.0),
        ],
    };

    let input = json!({
        "feature1": 4.0,
        "feature2": 2.0
    });

    let score = model.score(&input);
    // score = 10 + 2.5*4 + (-1)*2 = 10 + 10 - 2 = 18
    assert_eq!(score, 18.0);
}

struct LinearRegressionModel {
    intercept: f64,
    coefficients: Vec<(String, f64)>,
}

impl LinearRegressionModel {
    fn score(&self, input: &serde_json::Value) -> f64 {
        let mut result = self.intercept;

        for (feature, coef) in &self.coefficients {
            let value = input[feature].as_f64().unwrap_or(0.0);
            result += coef * value;
        }

        result
    }
}
