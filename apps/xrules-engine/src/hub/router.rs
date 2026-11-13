use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Rule struct used as execution payload.
/// Previously loaded from DB, now constructed from inline request data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    pub id: String,
    pub name: String,
    pub rule_type: String,
    pub definition: Value,
    pub status: String,
    pub project_id: String,
    pub engine: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// Determine engine based on rule type and content (static utility)
pub fn determine_engine(rule: &Rule) -> String {
    // 1. Check explicit engine field
    if !rule.engine.is_empty() && rule.engine != "null" {
        return rule.engine.clone();
    }

    // 2. Auto-detect from definition
    if let Some(def) = rule.definition.as_object() {
        if def.contains_key("pmml") {
            return "pmml".to_string();
        }
        if def.contains_key("model_path") {
            return "ml".to_string();
        }
        if def.contains_key("llm_provider") {
            return "llm".to_string();
        }
        if def.contains_key("neural_network") {
            return "ai".to_string();
        }
    }

    // 3. Default to rules engine
    "rules".to_string()
}
