// DMN 1.4 Standard Implementation
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// DMN Decision Table
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DecisionTable {
    pub id: String,
    pub name: String,
    pub hit_policy: HitPolicy,
    pub aggregation: Option<Aggregation>,
    pub inputs: Vec<InputClause>,
    pub outputs: Vec<OutputClause>,
    pub rules: Vec<DecisionRule>,
}

#[allow(non_camel_case_types, clippy::upper_case_acronyms)]
#[derive(Debug, Clone, Deserialize, Serialize)]
pub enum HitPolicy {
    UNIQUE,       // Only one rule can match
    ANY,          // All matching rules must produce same output
    PRIORITY,     // First rule in priority order
    FIRST,        // First rule in order
    COLLECT,      // Collect all outputs
    RULE_ORDER,   // Return all matches in rule order
    OUTPUT_ORDER, // Return all matches in output priority order
}

#[allow(clippy::upper_case_acronyms)]
#[derive(Debug, Clone, Deserialize, Serialize)]
pub enum Aggregation {
    SUM,
    COUNT,
    MIN,
    MAX,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct InputClause {
    pub id: String,
    pub label: Option<String>,
    pub expression: String,                // FEEL expression
    pub input_values: Option<Vec<String>>, // Allowed values
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct OutputClause {
    pub id: String,
    pub label: String,
    pub name: String,
    pub output_values: Option<Vec<String>>,
    pub default_value: Option<Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DecisionRule {
    pub id: String,
    pub input_entries: Vec<String>, // FEEL expressions
    pub output_entries: Vec<Value>,
    pub annotation: Option<String>,
}

/// FEEL Expression Parser (subset)
pub struct FeelParser;

impl FeelParser {
    /// Parse and evaluate a simple FEEL expression
    pub fn evaluate(_expression: &str, _context: &Value) -> Result<Value, String> {
        // TODO: Full FEEL parser implementation
        // For now, handle simple cases
        Ok(Value::Null)
    }
}
