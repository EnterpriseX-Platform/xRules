use crate::hub::HubError;
use serde::{Deserialize, Serialize};
use serde_json::Value;

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

impl<'r> sqlx::FromRow<'r, sqlx::postgres::PgRow> for Rule {
    fn from_row(row: &'r sqlx::postgres::PgRow) -> std::result::Result<Self, sqlx::Error> {
        use sqlx::Row;
        Ok(Rule {
            id: row.try_get("id")?,
            name: row.try_get("name")?,
            rule_type: row.try_get("rule_type")?,
            definition: row.try_get("definition")?,
            status: row.try_get("status")?,
            project_id: row.try_get("project_id")?,
            engine: row.try_get::<Option<String>, _>("engine")?.unwrap_or_else(|| "rules".to_string()),
            created_at: row.try_get("created_at")?,
            updated_at: row.try_get("updated_at")?,
        })
    }
}

pub struct EngineRouter {
    db_pool: sqlx::PgPool,
}

impl EngineRouter {
    pub fn new(db_pool: sqlx::PgPool) -> Self {
        Self { db_pool }
    }
    
    pub async fn get_rule(&self, rule_id: &str) -> Result<Rule, HubError> {
        let rule: Rule = sqlx::query_as(
            r#"
            SELECT id, name, type as rule_type, definition, status, project_id, 
                   COALESCE(engine, 'rules') as engine, created_at, updated_at
            FROM "Rule" WHERE id = $1
            "#
        )
        .bind(rule_id)
        .fetch_one(&self.db_pool)
        .await
        .map_err(|_| HubError::EngineError(format!("Rule not found: {}", rule_id)))?;
        
        Ok(rule)
    }
    
    /// Determine engine based on rule type and content
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
}
