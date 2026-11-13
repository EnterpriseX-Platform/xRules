// OpenAPI 3.1 Specification Generator
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct OpenApiSpec {
    pub openapi: String,
    pub info: Info,
    pub paths: HashMap<String, PathItem>,
    pub components: Option<Components>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Info {
    pub title: String,
    pub version: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PathItem {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub get: Option<Operation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub post: Option<Operation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub put: Option<Operation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delete: Option<Operation>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Operation {
    pub operation_id: String,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub request_body: Option<RequestBody>,
    pub responses: HashMap<String, Response>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RequestBody {
    pub description: Option<String>,
    pub content: HashMap<String, MediaType>,
    pub required: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Response {
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<HashMap<String, MediaType>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MediaType {
    pub schema: Schema,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Schema {
    #[serde(rename = "type")]
    pub schema_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub properties: Option<HashMap<String, Schema>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub items: Option<Box<Schema>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Components {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schemas: Option<HashMap<String, Schema>>,
}

pub fn generate_engine_api_spec() -> OpenApiSpec {
    OpenApiSpec {
        openapi: "3.1.0".to_string(),
        info: Info {
            title: "XRules Engine API".to_string(),
            version: "0.1.0".to_string(),
            description: Some("Multi-engine rule execution platform".to_string()),
        },
        paths: HashMap::new(),
        components: Some(Components {
            schemas: Some(HashMap::new()),
        }),
    }
}
