use async_trait::async_trait;
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::ExecutionLog;

/// Store for execution logs
#[async_trait]
pub trait LogStore: Send + Sync {
    async fn save(&self, log: &ExecutionLog) -> crate::Result<()>;
    async fn save_batch(&self, logs: &[ExecutionLog]) -> crate::Result<()>;
    async fn get_by_execution(&self, execution_id: Uuid, limit: i64, offset: i64) -> crate::Result<Vec<ExecutionLog>>;
    async fn get_by_level(&self, execution_id: Uuid, level: &str, limit: i64) -> crate::Result<Vec<ExecutionLog>>;
    async fn delete_by_execution(&self, execution_id: Uuid) -> crate::Result<()>;
    async fn search(&self, execution_id: Uuid, query: &str) -> crate::Result<Vec<ExecutionLog>>;
}

/// PostgreSQL implementation of LogStore
pub struct PostgresLogStore {
    pool: PgPool,
}

impl PostgresLogStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl LogStore for PostgresLogStore {
    async fn save(&self, log: &ExecutionLog) -> crate::Result<()> {
        sqlx::query(
            r#"
            INSERT INTO execution_logs (
                id, execution_id, node_id, level, message, metadata, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            "#
        )
        .bind(log.id)
        .bind(log.execution_id)
        .bind(&log.node_id)
        .bind(&log.level)
        .bind(&log.message)
        .bind(log.metadata.as_ref())
        .bind(log.created_at)
        .execute(&self.pool)
        .await
        .map_err(|e| crate::XRulesError::Store(e.to_string()))?;
        
        Ok(())
    }
    
    async fn save_batch(&self, logs: &[ExecutionLog]) -> crate::Result<()> {
        // Use a transaction for batch insert
        let mut tx = self.pool.begin().await
            .map_err(|e| crate::XRulesError::Store(e.to_string()))?;
        
        for log in logs {
            sqlx::query(
                r#"
                INSERT INTO execution_logs (
                    id, execution_id, node_id, level, message, metadata, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                "#
            )
            .bind(log.id)
            .bind(log.execution_id)
            .bind(&log.node_id)
            .bind(&log.level)
            .bind(&log.message)
            .bind(log.metadata.as_ref())
            .bind(log.created_at)
            .execute(&mut *tx)
            .await
            .map_err(|e| crate::XRulesError::Store(e.to_string()))?;
        }
        
        tx.commit().await
            .map_err(|e| crate::XRulesError::Store(e.to_string()))?;
        
        Ok(())
    }
    
    async fn get_by_execution(&self, execution_id: Uuid, limit: i64, offset: i64) -> crate::Result<Vec<ExecutionLog>> {
        let rows = sqlx::query_as::<_, LogRow>(
            r#"
            SELECT id, execution_id, node_id, level, message, metadata, created_at
            FROM execution_logs
            WHERE execution_id = $1
            ORDER BY created_at ASC
            LIMIT $2 OFFSET $3
            "#
        )
        .bind(execution_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| crate::XRulesError::Store(e.to_string()))?;
        
        Ok(rows.into_iter().map(|r| r.into()).collect())
    }
    
    async fn get_by_level(&self, execution_id: Uuid, level: &str, limit: i64) -> crate::Result<Vec<ExecutionLog>> {
        let rows = sqlx::query_as::<_, LogRow>(
            r#"
            SELECT id, execution_id, node_id, level, message, metadata, created_at
            FROM execution_logs
            WHERE execution_id = $1 AND level = $2
            ORDER BY created_at ASC
            LIMIT $3
            "#
        )
        .bind(execution_id)
        .bind(level)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| crate::XRulesError::Store(e.to_string()))?;
        
        Ok(rows.into_iter().map(|r| r.into()).collect())
    }
    
    async fn delete_by_execution(&self, execution_id: Uuid) -> crate::Result<()> {
        sqlx::query("DELETE FROM execution_logs WHERE execution_id = $1")
            .bind(execution_id)
            .execute(&self.pool)
            .await
            .map_err(|e| crate::XRulesError::Store(e.to_string()))?;
        
        Ok(())
    }
    
    async fn search(&self, execution_id: Uuid, query: &str) -> crate::Result<Vec<ExecutionLog>> {
        let search_pattern = format!("%{}%", query);
        
        let rows = sqlx::query_as::<_, LogRow>(
            r#"
            SELECT id, execution_id, node_id, level, message, metadata, created_at
            FROM execution_logs
            WHERE execution_id = $1 AND message ILIKE $2
            ORDER BY created_at ASC
            "#
        )
        .bind(execution_id)
        .bind(search_pattern)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| crate::XRulesError::Store(e.to_string()))?;
        
        Ok(rows.into_iter().map(|r| r.into()).collect())
    }
}

#[derive(sqlx::FromRow)]
struct LogRow {
    id: Option<Uuid>,
    execution_id: Uuid,
    node_id: String,
    level: String,
    message: String,
    metadata: Option<serde_json::Value>,
    created_at: chrono::DateTime<chrono::Utc>,
}

impl From<LogRow> for ExecutionLog {
    fn from(row: LogRow) -> Self {
        Self {
            id: row.id,
            execution_id: row.execution_id,
            node_id: row.node_id,
            level: row.level,
            message: row.message,
            metadata: row.metadata,
            created_at: row.created_at,
        }
    }
}
