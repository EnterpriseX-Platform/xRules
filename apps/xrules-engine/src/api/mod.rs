pub mod health;
pub mod execute;
pub mod engines;
pub mod validate;
pub mod docs;

use utoipa::OpenApi;

/// Main API documentation
#[derive(OpenApi)]
#[openapi(
    info(
        title = "XRules Engine API",
        description = "Multi-engine rule execution platform supporting DMN, PMML, ML, LLM, and AI models",
        version = "0.1.0",
        contact(
            name = "XRules Team",
            url = "https://github.com/xrules/platform"
        ),
        license(
            name = "MIT",
            url = "https://opensource.org/licenses/MIT"
        )
    ),
    servers(
        (url = "http://localhost:50051/api/v1", description = "Local development server"),
        (url = "https://api.xrules.io/v1", description = "Production server")
    ),
    tags(
        (name = "Health", description = "Health check endpoints"),
        (name = "Authentication", description = "Authentication and authorization endpoints"),
        (name = "Execution", description = "Rule execution endpoints"),
        (name = "Engines", description = "Engine management endpoints"),
        (name = "Validation", description = "Rule validation endpoints")
    ),
    paths(
        health::health_check,
        execute::execute_rule,
        engines::list_engines,
        engines::get_engine_standards,
        validate::validate_rule
    ),
    components(
        schemas(
            ExecuteRequest,
            ExecuteResponse,
            ValidateRequest,
            ValidateResponse,
            EngineInfo,
            EngineType,
            Standard,
            EngineStatus,
            Rule,
            RuleDefinition,
            RuleNode,
            RuleEdge,
            RuleStatus,
            DmnDefinition,
            DmnInput,
            DmnOutput,
            DmnRule,
            HitPolicy,
            ErrorResponse,
            ValidationError,
            HealthResponse
        )
    ),
    modifiers(&SecurityAddon)
)]
pub struct ApiDoc;

use utoipa::openapi::security::{HttpAuthScheme, HttpBuilder, SecurityScheme};

pub struct SecurityAddon;

impl utoipa::Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        if let Some(components) = openapi.components.as_mut() {
            components.add_security_scheme(
                "bearer_auth",
                SecurityScheme::Http(
                    HttpBuilder::new()
                        .scheme(HttpAuthScheme::Bearer)
                        .bearer_format("JWT")
                        .description(Some("JWT token authentication"))
                        .build(),
                ),
            );
        }
    }
}

// ============== Request/Response Schemas ==============

#[derive(serde::Serialize, serde::Deserialize, utoipa::ToSchema, Debug, Clone)]
pub struct RulePayloadApi {
    /// Rule type (DECISION_TABLE, DECISION_TREE, etc.)
    #[serde(rename = "type")]
    #[schema(example = "DECISION_TABLE")]
    pub rule_type: String,
    /// Engine to use (rules, pmml, ml, llm, ai)
    #[schema(example = "rules")]
    pub engine: String,
    /// Full rule definition JSON
    #[schema(example = json!({"hitPolicy": "FIRST", "inputs": [], "outputs": [], "rules": []}))]
    pub definition: serde_json::Value,
}

#[derive(serde::Serialize, serde::Deserialize, utoipa::ToSchema, Debug, Clone)]
pub struct ExecuteRequest {
    /// Inline rule definition
    pub rule: RulePayloadApi,
    #[schema(example = json!({"age": 25, "income": 50000}))]
    pub input: serde_json::Value,
    #[schema(example = json!({"user_id": "user-123", "request_id": "req-456"}))]
    pub context: Option<serde_json::Value>,
}

#[derive(serde::Serialize, utoipa::ToSchema, Debug, Clone)]
pub struct ExecuteResponse {
    #[schema(example = true)]
    pub success: bool,
    #[schema(example = json!({"decision": "APPROVE", "score": 0.85}))]
    pub output: Option<serde_json::Value>,
    #[schema(example = "Rule not found")]
    pub error: Option<String>,
    #[schema(example = 45)]
    pub duration_ms: u64,
    #[schema(example = "rules")]
    pub engine_used: Option<String>,
}

#[derive(serde::Deserialize, utoipa::ToSchema, Debug, Clone)]
pub struct ValidateRequest {
    /// Inline rule definition to validate
    pub rule: RulePayloadApi,
}

#[derive(serde::Serialize, utoipa::ToSchema, Debug, Clone)]
pub struct ValidateResponse {
    #[schema(example = true)]
    pub valid: bool,
    pub errors: Vec<String>,
}

// ============== Engine Schemas ==============

#[derive(serde::Serialize, utoipa::ToSchema, Debug, Clone)]
pub struct EngineInfo {
    #[schema(example = "rules-engine")]
    pub name: String,
    #[schema(example = "rules")]
    pub engine_type: String,
    pub status: EngineStatus,
    pub standards: Vec<String>,
    #[schema(example = "0.1.0")]
    pub version: String,
}

#[derive(serde::Serialize, utoipa::ToSchema, Debug, Clone)]
pub enum EngineType {
    Rules,
    Pmml,
    Ml,
    Llm,
    Ai,
}

#[derive(serde::Serialize, utoipa::ToSchema, Debug, Clone)]
pub enum EngineStatus {
    Healthy,
    Unhealthy,
    Starting,
    Disabled,
}

#[derive(serde::Serialize, utoipa::ToSchema, Debug, Clone)]
pub struct Standard {
    #[schema(example = "DMN")]
    pub name: String,
    #[schema(example = "1.4")]
    pub version: String,
    #[schema(example = "Decision Model and Notation")]
    pub description: String,
}

// ============== Rule Schemas ==============

#[derive(serde::Serialize, serde::Deserialize, utoipa::ToSchema, Debug, Clone)]
pub struct Rule {
    #[schema(example = "550e8400-e29b-41d4-a716-446655440000")]
    pub id: String,
    #[schema(example = "Loan Approval Rule")]
    pub name: String,
    #[schema(example = "DECISION_TABLE")]
    pub rule_type: String,
    pub definition: RuleDefinition,
    pub status: RuleStatus,
    #[schema(example = "proj-123")]
    pub project_id: String,
    #[schema(example = "rules")]
    pub engine: String,
    #[schema(example = "2024-01-15T10:30:00Z")]
    pub created_at: String,
    #[schema(example = "2024-01-20T14:45:00Z")]
    pub updated_at: String,
}

#[derive(serde::Serialize, serde::Deserialize, utoipa::ToSchema, Debug, Clone)]
pub struct RuleDefinition {
    pub nodes: Vec<RuleNode>,
    pub edges: Vec<RuleEdge>,
    pub dmn: Option<DmnDefinition>,
}

#[derive(serde::Serialize, serde::Deserialize, utoipa::ToSchema, Debug, Clone)]
pub struct RuleNode {
    #[schema(example = "node-1")]
    pub id: String,
    #[schema(example = "decisionTable")]
    pub node_type: String,
    pub data: serde_json::Value,
}

#[derive(serde::Serialize, serde::Deserialize, utoipa::ToSchema, Debug, Clone)]
pub struct RuleEdge {
    #[schema(example = "edge-1")]
    pub id: String,
    #[schema(example = "node-1")]
    pub source: String,
    #[schema(example = "node-2")]
    pub target: String,
}

#[derive(serde::Serialize, serde::Deserialize, utoipa::ToSchema, Debug, Clone)]
pub enum RuleStatus {
    Draft,
    Active,
    Archived,
    Error,
}

// ============== DMN Schemas ==============

#[derive(serde::Serialize, serde::Deserialize, utoipa::ToSchema, Debug, Clone)]
pub struct DmnDefinition {
    pub hit_policy: HitPolicy,
    pub inputs: Vec<DmnInput>,
    pub outputs: Vec<DmnOutput>,
    pub rules: Vec<DmnRule>,
}

#[derive(serde::Serialize, serde::Deserialize, utoipa::ToSchema, Debug, Clone)]
pub struct DmnInput {
    #[schema(example = "age")]
    pub name: String,
    #[schema(example = "age")]
    pub expression: String,
    #[schema(example = "number")]
    pub input_type: String,
}

#[derive(serde::Serialize, serde::Deserialize, utoipa::ToSchema, Debug, Clone)]
pub struct DmnOutput {
    #[schema(example = "decision")]
    pub name: String,
    #[schema(example = "Loan Decision")]
    pub label: String,
    #[schema(example = "string")]
    pub output_type: String,
}

#[derive(serde::Serialize, serde::Deserialize, utoipa::ToSchema, Debug, Clone)]
pub struct DmnRule {
    #[schema(example = "rule-1")]
    pub id: String,
    #[schema(example = json![[">= 18", "> 50000"]])]
    pub inputs: Vec<String>,
    #[schema(example = json![["APPROVE"]])]
    pub outputs: Vec<serde_json::Value>,
}

#[derive(serde::Serialize, serde::Deserialize, utoipa::ToSchema, Debug, Clone)]
pub enum HitPolicy {
    Unique,
    First,
    Any,
    Collect,
    RuleOrder,
    OutputOrder,
    Priority,
}

// ============== Error Schemas ==============

#[derive(serde::Serialize, utoipa::ToSchema, Debug, Clone)]
pub struct ErrorResponse {
    #[schema(example = 400)]
    pub status: u16,
    #[schema(example = "VALIDATION_ERROR")]
    pub error: String,
    #[schema(example = "Invalid rule definition")]
    pub message: String,
    #[schema(example = "req-123-456")]
    pub request_id: String,
    pub details: Option<Vec<ValidationError>>,
}

#[derive(serde::Serialize, utoipa::ToSchema, Debug, Clone)]
pub struct ValidationError {
    #[schema(example = "definition.nodes[0].type")]
    pub field: String,
    #[schema(example = "Unknown node type: invalid")]
    pub message: String,
}

// ============== Common Schemas ==============

#[derive(serde::Serialize, utoipa::ToSchema, Debug, Clone)]
pub struct HealthResponse {
    #[schema(example = "healthy")]
    pub status: String,
    #[schema(example = "xrules-engine-hub")]
    pub service: String,
    #[schema(example = "0.1.0")]
    pub version: String,
    pub engines: Vec<String>,
}
