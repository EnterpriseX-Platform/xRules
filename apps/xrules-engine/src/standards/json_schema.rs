// JSON Schema Draft 2020-12 Implementation
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

/// JSON Schema 2020-12
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct JsonSchema {
    #[serde(rename = "$schema", skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    #[serde(rename = "$id", skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub schema_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub properties: Option<HashMap<String, JsonSchema>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub items: Option<Box<JsonSchema>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enum_values: Option<Vec<Value>>,
    #[serde(rename = "enum", skip_serializing_if = "Option::is_none")]
    pub enum_keyword: Option<Vec<Value>>,
}

/// Simple JSON Schema validator
pub struct SchemaValidator;

impl SchemaValidator {
    /// Validate a value against a schema
    pub fn validate(value: &Value, schema: &JsonSchema) -> Vec<ValidationError> {
        let mut errors = vec![];
        
        // Type validation
        if let Some(ref schema_type) = schema.schema_type {
            if !Self::check_type(value, schema_type) {
                errors.push(ValidationError {
                    path: "/".to_string(),
                    message: format!("Expected type {}, got {:?}", schema_type, value),
                });
            }
        }
        
        errors
    }
    
    fn check_type(value: &Value, expected: &str) -> bool {
        match expected {
            "object" => value.is_object(),
            "array" => value.is_array(),
            "string" => value.is_string(),
            "number" => value.is_number(),
            "integer" => value.is_i64() || value.is_u64(),
            "boolean" => value.is_boolean(),
            "null" => value.is_null(),
            _ => true,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ValidationError {
    pub path: String,
    pub message: String,
}
