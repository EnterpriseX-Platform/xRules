use async_trait::async_trait;
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::{ExecutionRecord, ExecutionStatus};

/// Store for execution records
#[async_trait]
pub trait ExecutionStore: Send + Sync {
    async fn save(&self, execution: &ExecutionRecord) -> crate::Result<()>;
    async fn get(&self, execution_id: Uuid) -> crate::Result<Option<ExecutionRecord>>;
    async fn update_status(&self, execution_id: Uuid, status: ExecutionStatus) -> crate::Result<()>;
    async fn list_by_flow(&self, flow_id: Uuid, limit: i64, offset: i64) -> crate::Result<Vec<ExecutionRecord>>;
    async fn list_by_project(&self, project_id: Uuid, limit: i64, offset: i64) -> crate::Result<Vec<ExecutionRecord>>;
    async fn delete(&self, execution_id: Uuid) -> crate::Result<()>;
    async fn count_by_status(&self, flow_id: Option<Uuid>, status: ExecutionStatus) -> crate::Result<i64>;
}

/// PostgreSQL implementation of ExecutionStore
pub struct PostgresExecutionStore {
    pool: PgPool,
}

impl PostgresExecutionStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl ExecutionStore for PostgresExecutionStore {
    async fn save(&self, execution: &ExecutionRecord) -> crate::Result<()> {
        sqlx::query(
            r#"
            INSERT INTO executions (
                id, flow_id, project_id, workspace_id, status, input_data,
                output_data, variables, error_message, started_at, completed_at,
                duration_ms, created_at, updated_at, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (id) DO UPDATE SET
                status = EXCLUDED.status,
                output_data = EXCLUDED.output_data,
                variables = EXCLUDED.variables,
                error_message = EXCLUDED.error_message,
                started_at = EXCLUDED.started_at,
                completed_at = EXCLUDED.completed_at,
                duration_ms = EXCLUDED.duration_ms,
                updated_at = EXCLUDED.updated_at
            "#
        )
        .bind(execution.id)
        .bind(execution.flow_id)
        .bind(execution.project_id)
        .bind(execution.workspace_id)
        .bind(execution.status.to_string())
        .bind(execution.input_data.as_ref())
        .bind(execution.output_data.as_ref())
        .bind(execution.variables.as_ref())
        .bind(execution.error_message.as_ref())
        .bind(execution.started_at)
        .bind(execution.completed_at)
        .bind(execution.duration_ms)
        .bind(execution.created_at.unwrap_or_else(chrono::Utc::now))
        .bind(execution.updated_at.unwrap_or_else(chrono::Utc::now))
        .bind(execution.metadata.as_ref())
        .execute(&self.pool)
        .await
        .map_err(|e| crate::XRulesError::Store(e.to_string()))?;
        
        Ok(())
    }
    
    async fn get(&self, execution_id: Uuid) -> crate::Result<Option<ExecutionRecord>> {
        let row = sqlx::query_as::<_, ExecutionRow>(
            r#"
            SELECT 
                id, flow_id, project_id, workspace_id, status, input_data,
                output_data, variables, error_message, started_at, completed_at,
                duration_ms, created_at, updated_at, metadata
            FROM executions
            WHERE id = $1
            "#
        )
        .bind(execution_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| crate::XRulesError::Store(e.to_string()))?;
        
        Ok(row.map(|r| r.into()))
    }
    
    async fn update_status(&self, execution_id: Uuid, status: ExecutionStatus) -> crate::Result<()> {
        sqlx::query(
            "UPDATE executions SET status = $1, updated_at = NOW() WHERE id = $2"
        )
        .bind(status.to_string())
        .bind(execution_id)
        .execute(&self.pool)
        .await
        .map_err(|e| crate::XRulesError::Store(e.to_string()))?;
        
        Ok(())
    }
    
    async fn list_by_flow(&self, flow_id: Uuid, limit: i64, offset: i64) -> crate::Result<Vec<ExecutionRecord>> {
        let rows = sqlx::query_as::<_, ExecutionRow>(
            r#"
            SELECT 
                id, flow_id, project_id, workspace_id, status, input_data,
                output_data, variables, error_message, started_at, completed_at,
                duration_ms, created_at, updated_at, metadata
            FROM executions
            WHERE flow_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#
        )
        .bind(flow_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| crate::XRulesError::Store(e.to_string()))?;
        
        Ok(rows.into_iter().map(|r| r.into()).collect())
    }
    
    async fn list_by_project(&self, project_id: Uuid, limit: i64, offset: i64) -> crate::Result<Vec<ExecutionRecord>> {
        let rows = sqlx::query_as::<_, ExecutionRow>(
            r#"
            SELECT 
                id, flow_id, project_id, workspace_id, status, input_data,
                output_data, variables, error_message, started_at, completed_at,
                duration_ms, created_at, updated_at, metadata
            FROM executions
            WHERE project_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#
        )
        .bind(project_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| crate::XRulesError::Store(e.to_string()))?;
        
        Ok(rows.into_iter().map(|r| r.into()).collect())
    }
    
    async fn delete(&self, execution_id: Uuid) -> crate::Result<()> {
        sqlx::query("DELETE FROM executions WHERE id = $1")
            .bind(execution_id)
            .execute(&self.pool)
            .await
            .map_err(|e| crate::XRulesError::Store(e.to_string()))?;
        
        Ok(())
    }
    
    async fn count_by_status(&self, flow_id: Option<Uuid>, status: ExecutionStatus) -> crate::Result<i64> {
        let count: i64 = if let Some(flow_id) = flow_id {
            sqlx::query_scalar("SELECT COUNT(*) FROM executions WHERE flow_id = $1 AND status = $2")
                .bind(flow_id)
                .bind(status.to_string())
                .fetch_one(&self.pool)
                .await
        } else {
            sqlx::query_scalar("SELECT COUNT(*) FROM executions WHERE status = $1")
                .bind(status.to_string())
                .fetch_one(&self.pool)
                .await
        }
        .map_err(|e| crate::XRulesError::Store(e.to_string()))?;
        
        Ok(count)
    }
}

#[derive(sqlx::FromRow)]
struct ExecutionRow {
    id: Uuid,
    flow_id: Uuid,
    project_id: Uuid,
    workspace_id: Option<Uuid>,
    status: String,
    input_data: Option<serde_json::Value>,
    output_data: Option<serde_json::Value>,
    variables: Option<serde_json::Value>,
    error_message: Option<String>,
    started_at: Option<chrono::DateTime<chrono::Utc>>,
    completed_at: Option<chrono::DateTime<chrono::Utc>>,
    duration_ms: Option<i64>,
    created_at: Option<chrono::DateTime<chrono::Utc>>,
    updated_at: Option<chrono::DateTime<chrono::Utc>>,
    metadata: Option<serde_json::Value>,
}

impl From<ExecutionRow> for ExecutionRecord {
    fn from(row: ExecutionRow) -> Self {
        Self {
            id: row.id,
            flow_id: row.flow_id,
            project_id: row.project_id,
            workspace_id: row.workspace_id,
            status: parse_status(&row.status),
            input_data: row.input_data,
            output_data: row.output_data,
            variables: row.variables,
            error_message: row.error_message,
            started_at: row.started_at,
            completed_at: row.completed_at,
            duration_ms: row.duration_ms,
            created_at: row.created_at,
            updated_at: row.updated_at,
            metadata: row.metadata,
        }
    }
}

fn parse_status(s: &str) -> ExecutionStatus {
    match s {
        "PENDING" | "pending" => ExecutionStatus::Pending,
        "RUNNING" | "running" => ExecutionStatus::Running,
        "COMPLETED" | "completed" => ExecutionStatus::Completed,
        "FAILED" | "failed" => ExecutionStatus::Failed,
        "CANCELLED" | "cancelled" => ExecutionStatus::Cancelled,
        "TIMEOUT" | "timeout" => ExecutionStatus::Timeout,
        _ => ExecutionStatus::Pending,
    }
}
