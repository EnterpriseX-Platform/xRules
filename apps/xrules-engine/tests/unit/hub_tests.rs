//! Engine Hub Unit Tests

use serde_json::json;
use xrules_engine::hub::{
    types::{EngineType, ExecuteRequest, ExecuteResponse, Standard},
    EngineInfo,
};

#[test]
fn test_engine_type_display() {
    assert_eq!(EngineType::Rules.to_string(), "rules");
    assert_eq!(EngineType::Pmml.to_string(), "pmml");
    assert_eq!(EngineType::Ml.to_string(), "ml");
    assert_eq!(EngineType::Llm.to_string(), "llm");
    assert_eq!(EngineType::Ai.to_string(), "ai");
}

#[test]
fn test_engine_type_debug() {
    assert_eq!(format!("{:?}", EngineType::Rules), "rules");
    assert_eq!(format!("{:?}", EngineType::Pmml), "pmml");
}

#[test]
fn test_engine_type_from_str() {
    // Rules engine variations
    assert_eq!(EngineType::from_str("rules").unwrap(), EngineType::Rules);
    assert_eq!(EngineType::from_str("RULES").unwrap(), EngineType::Rules);
    assert_eq!(EngineType::from_str("rust").unwrap(), EngineType::Rules);
    assert_eq!(EngineType::from_str("Rust").unwrap(), EngineType::Rules);

    // PMML engine variations
    assert_eq!(EngineType::from_str("pmml").unwrap(), EngineType::Pmml);
    assert_eq!(EngineType::from_str("PMML").unwrap(), EngineType::Pmml);
    assert_eq!(EngineType::from_str("r").unwrap(), EngineType::Pmml);
    assert_eq!(EngineType::from_str("R").unwrap(), EngineType::Pmml);

    // ML engine variations
    assert_eq!(EngineType::from_str("ml").unwrap(), EngineType::Ml);
    assert_eq!(EngineType::from_str("ML").unwrap(), EngineType::Ml);
    assert_eq!(EngineType::from_str("python-ml").unwrap(), EngineType::Ml);
    assert_eq!(EngineType::from_str("Python-ML").unwrap(), EngineType::Ml);

    // LLM engine
    assert_eq!(EngineType::from_str("llm").unwrap(), EngineType::Llm);
    assert_eq!(EngineType::from_str("LLM").unwrap(), EngineType::Llm);

    // AI engine variations
    assert_eq!(EngineType::from_str("ai").unwrap(), EngineType::Ai);
    assert_eq!(EngineType::from_str("AI").unwrap(), EngineType::Ai);
    assert_eq!(
        EngineType::from_str("deep-learning").unwrap(),
        EngineType::Ai
    );

    // Invalid engine type
    assert!(EngineType::from_str("unknown").is_err());
    assert!(EngineType::from_str("").is_err());
}

#[test]
fn test_standard_creation() {
    let standard = Standard::new("DMN", "1.4", "Decision Model and Notation");

    assert_eq!(standard.name, "DMN");
    assert_eq!(standard.version, "1.4");
    assert_eq!(standard.description, "Decision Model and Notation");
}

#[test]
fn test_standard_serialization() {
    let standard = Standard::new("PMML", "4.4", "Predictive Model Markup Language");

    let json = serde_json::to_string(&standard).unwrap();
    assert!(json.contains("PMML"));
    assert!(json.contains("4.4"));
    assert!(json.contains("Predictive Model Markup Language"));
}

#[test]
fn test_execute_request_deserialization() {
    let json_data = json!({
        "rule_id": "test-rule-123",
        "input": {
            "age": 30,
            "income": 50000
        }
    });

    let req: ExecuteRequest = serde_json::from_value(json_data).unwrap();
    assert_eq!(req.rule_id, "test-rule-123");
    assert_eq!(req.input["age"], 30);
    assert_eq!(req.input["income"], 50000);
    assert!(req.context.is_none());
}

#[test]
fn test_execute_request_with_context() {
    let json_data = json!({
        "rule_id": "test-rule-123",
        "input": {"value": 100},
        "context": {"tenant_id": "tenant-1"}
    });

    let req: ExecuteRequest = serde_json::from_value(json_data).unwrap();
    assert_eq!(req.rule_id, "test-rule-123");
    assert!(req.context.is_some());
    assert_eq!(req.context.unwrap()["tenant_id"], "tenant-1");
}

#[test]
fn test_execute_response_serialization() {
    let response = ExecuteResponse {
        success: true,
        output: Some(json!({"result": "approved"})),
        error: None,
        duration_ms: 150,
        engine_used: Some("rules".to_string()),
    };

    let json_str = serde_json::to_string(&response).unwrap();
    assert!(json_str.contains("\"success\":true"));
    assert!(json_str.contains("\"result\":\"approved\""));
    assert!(json_str.contains("\"duration_ms\":150"));
}

#[test]
fn test_execute_response_error() {
    let response = ExecuteResponse {
        success: false,
        output: None,
        error: Some("Rule not found".to_string()),
        duration_ms: 10,
        engine_used: None,
    };

    let json = serde_json::to_value(&response).unwrap();
    assert_eq!(json["success"], false);
    assert_eq!(json["error"], "Rule not found");
    assert!(json["output"].is_null());
}

#[test]
fn test_engine_info_creation() {
    let info = EngineInfo {
        name: "Rules Engine".to_string(),
        engine_type: "rules".to_string(),
        status: "healthy".to_string(),
        standards: vec!["DMN".to_string(), "JSON".to_string()],
        version: "1.0.0".to_string(),
    };

    assert_eq!(info.name, "Rules Engine");
    assert_eq!(info.engine_type, "rules");
    assert_eq!(info.status, "healthy");
    assert_eq!(info.standards.len(), 2);
    assert_eq!(info.version, "1.0.0");
}

#[test]
fn test_engine_info_serialization() {
    let info = EngineInfo {
        name: "ML Engine".to_string(),
        engine_type: "ml".to_string(),
        status: "healthy".to_string(),
        standards: vec!["PMML".to_string(), "ONNX".to_string()],
        version: "2.1.0".to_string(),
    };

    let json = serde_json::to_value(&info).unwrap();
    assert_eq!(json["name"], "ML Engine");
    assert_eq!(json["engine_type"], "ml");
    assert!(json["standards"]
        .as_array()
        .unwrap()
        .contains(&json!("PMML")));
}

#[test]
fn test_engine_type_equality() {
    let rules1 = EngineType::Rules;
    let rules2 = EngineType::Rules;
    let pmml = EngineType::Pmml;

    assert_eq!(rules1, rules2);
    assert_ne!(rules1, pmml);
}

#[test]
fn test_engine_type_hash() {
    use std::collections::HashSet;

    let mut set = HashSet::new();
    set.insert(EngineType::Rules);
    set.insert(EngineType::Pmml);
    set.insert(EngineType::Rules); // Duplicate

    assert_eq!(set.len(), 2);
}
