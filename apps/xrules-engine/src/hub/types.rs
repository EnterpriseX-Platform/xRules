use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub enum EngineType {
    Rules,
    Pmml,
    Ml,
    Llm,
    Ai,
}

impl std::fmt::Display for EngineType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EngineType::Rules => write!(f, "rules"),
            EngineType::Pmml => write!(f, "pmml"),
            EngineType::Ml => write!(f, "ml"),
            EngineType::Llm => write!(f, "llm"),
            EngineType::Ai => write!(f, "ai"),
        }
    }
}

impl std::fmt::Debug for EngineType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self)
    }
}

impl EngineType {
    pub fn from_str(s: &str) -> std::result::Result<Self, String> {
        match s.to_lowercase().as_str() {
            "rules" | "rust" => Ok(EngineType::Rules),
            "pmml" | "r" => Ok(EngineType::Pmml),
            "ml" | "python-ml" => Ok(EngineType::Ml),
            "llm" => Ok(EngineType::Llm),
            "ai" | "deep-learning" => Ok(EngineType::Ai),
            _ => Err(format!("Unknown engine type: {}", s)),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct RulePayload {
    /// Rule type (DECISION_TABLE, DECISION_TREE, etc.)
    #[serde(rename = "type")]
    pub rule_type: String,
    /// Engine to use (rules, pmml, ml, llm, ai)
    pub engine: String,
    /// Full rule definition JSON
    pub definition: Value,
}

#[derive(Debug, Deserialize)]
pub struct ExecuteRequest {
    /// Inline rule definition (sent by Studio Backend)
    pub rule: RulePayload,
    pub input: Value,
    #[serde(default)]
    pub context: Option<Value>,
}

#[derive(Debug, Serialize)]
pub struct ExecuteResponse {
    pub success: bool,
    pub output: Option<Value>,
    pub error: Option<String>,
    pub duration_ms: u64,
    pub engine_used: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Standard {
    pub name: String,
    pub version: String,
    pub description: String,
}

impl Standard {
    pub fn new(name: &str, version: &str, description: &str) -> Self {
        Self {
            name: name.to_string(),
            version: version.to_string(),
            description: description.to_string(),
        }
    }
}
