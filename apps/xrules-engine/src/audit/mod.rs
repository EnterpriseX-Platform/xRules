//! Audit & Analytics Module
//! ส่ง execution logs ไป TimescaleDB แทนการสร้าง Analytic Engine

use serde_json::Value;
use chrono::Utc;

/// Audit log entry สำหรับทุก execution
#[derive(Debug, Clone)]
pub struct ExecutionAudit {
    pub id: String,
    pub rule_id: String,
    pub rule_name: String,
    pub engine: String,
    pub input: Value,
    pub output: Value,
    pub duration_ms: i64,
    pub status: String,
    pub user_id: String,
    pub timestamp: chrono::DateTime<Utc>,
}

pub struct AuditLogger;

impl AuditLogger {
    pub fn new() -> Self {
        Self
    }
    
    pub async fn log_execution(&self, audit: ExecutionAudit) {
        tracing::info!(
            rule_id = %audit.rule_id,
            engine = %audit.engine,
            duration_ms = audit.duration_ms,
            status = %audit.status,
            "Rule execution audit"
        );
    }
}
