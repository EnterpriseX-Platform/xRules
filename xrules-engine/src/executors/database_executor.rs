use async_trait::async_trait;
use sqlx::{Pool, Postgres};
use std::sync::Arc;

use crate::executors::ConnectionPool;
use crate::models::{DatabaseConfig, DatabaseType, ExecutionError};

/// Database connection pool wrapper
pub struct DatabaseConnectionPool {
    config: DatabaseConfig,
    pool: Option<Pool<Postgres>>,
}

impl DatabaseConnectionPool {
    pub async fn new(config: DatabaseConfig) -> Result<Self, ExecutionError> {
        let pool = Self::create_pool(&config).await?;
        
        Ok(Self {
            config,
            pool: Some(pool),
        })
    }
    
    async fn create_pool(config: &DatabaseConfig) -> Result<Pool<Postgres>, ExecutionError> {
        let connection_string = config.connection_string.as_ref()
            .map(|s| s.clone())
            .unwrap_or_else(|| {
                format!(
                    "postgres://{}:{}@{}:{}/{}",
                    config.username,
                    config.password.as_deref().unwrap_or(""),
                    config.host,
                    config.port,
                    config.database
                )
            });
        
        let pool = Pool::connect(&connection_string).await
            .map_err(|e| ExecutionError::connection_error(format!("Failed to create pool: {}", e)))?;
        
        Ok(pool)
    }
    
    pub async fn get_pool(&self) -> Result<&Pool<Postgres>, ExecutionError> {
        self.pool.as_ref()
            .ok_or_else(|| ExecutionError::connection_error("Pool not initialized"))
    }
    
    pub async fn execute_query(&self, query: &str) -> Result<Vec<serde_json::Value>, ExecutionError> {
        let pool = self.get_pool().await?;
        
        let rows = sqlx::query(query)
            .fetch_all(pool)
            .await
            .map_err(|e| ExecutionError::external_error(format!("Query error: {}", e)))?;
        
        let mut results = Vec::new();
        for row in rows {
            results.push(self.row_to_json(&row)?);
        }
        
        Ok(results)
    }
    
    pub async fn execute(&self, query: &str) -> Result<u64, ExecutionError> {
        let pool = self.get_pool().await?;
        
        let result = sqlx::query(query)
            .execute(pool)
            .await
            .map_err(|e| ExecutionError::external_error(format!("Execute error: {}", e)))?;
        
        Ok(result.rows_affected())
    }
    
    fn row_to_json(&self, row: &sqlx::postgres::PgRow) -> Result<serde_json::Value, ExecutionError> {
        use sqlx::Column;
        use sqlx::TypeInfo;
        
        let mut obj = serde_json::Map::new();
        
        for (i, column) in row.columns().iter().enumerate() {
            let name = column.name();
            let type_info = column.type_info().name();
            
            let value: serde_json::Value = match type_info {
                "TEXT" | "VARCHAR" | "CHAR" | "NAME" | "UNKNOWN" => {
                    row.try_get::<String, _>(i)
                        .map(serde_json::Value::String)
                        .unwrap_or(serde_json::Value::Null)
                }
                "INT2" | "INT4" => {
                    row.try_get::<i32, _>(i)
                        .map(|v| serde_json::json!(v))
                        .unwrap_or(serde_json::Value::Null)
                }
                "INT8" => {
                    row.try_get::<i64, _>(i)
                        .map(|v| serde_json::json!(v))
                        .unwrap_or(serde_json::Value::Null)
                }
                "FLOAT4" | "FLOAT8" | "NUMERIC" => {
                    row.try_get::<f64, _>(i)
                        .map(|v| serde_json::json!(v))
                        .unwrap_or(serde_json::Value::Null)
                }
                "BOOL" => {
                    row.try_get::<bool, _>(i)
                        .map(|v| serde_json::json!(v))
                        .unwrap_or(serde_json::Value::Null)
                }
                "TIMESTAMP" | "TIMESTAMPTZ" => {
                    row.try_get::<chrono::DateTime<chrono::Utc>, _>(i)
                        .map(|v| serde_json::json!(v.to_rfc3339()))
                        .unwrap_or(serde_json::Value::Null)
                }
                "JSON" | "JSONB" => {
                    row.try_get::<serde_json::Value, _>(i)
                        .unwrap_or(serde_json::Value::Null)
                }
                "UUID" => {
                    row.try_get::<uuid::Uuid, _>(i)
                        .map(|v| serde_json::json!(v.to_string()))
                        .unwrap_or(serde_json::Value::Null)
                }
                _ => {
                    row.try_get::<String, _>(i)
                        .map(serde_json::Value::String)
                        .unwrap_or(serde_json::Value::Null)
                }
            };
            
            obj.insert(name.to_string(), value);
        }
        
        Ok(serde_json::Value::Object(obj))
    }
}

#[async_trait]
impl ConnectionPool<Pool<Postgres>> for DatabaseConnectionPool {
    async fn get_connection(&self, _name: &str) -> Result<Arc<Pool<Postgres>>, ExecutionError> {
        match &self.pool {
            Some(pool) => Ok(Arc::new(pool.clone())),
            None => Err(ExecutionError::connection_error("Pool not available")),
        }
    }
    
    async fn add_connection(&self, _name: String, _connection: crate::models::Connection) -> Result<(), ExecutionError> {
        // Pool is already created in constructor
        Ok(())
    }
    
    async fn remove_connection(&self, _name: &str) -> Result<(), ExecutionError> {
        Ok(())
    }
    
    async fn test_connection(&self, _name: &str) -> Result<bool, ExecutionError> {
        let pool = self.get_pool().await?;
        
        match sqlx::query("SELECT 1").fetch_one(pool).await {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }
    
    fn list_connections(&self) -> Vec<String> {
        vec![self.config.database.clone()]
    }
}
