use async_trait::async_trait;
use sqlx::Row;

use crate::engine::NodeExecutor;
use crate::models::{ExecutionContext, ExecutionError, Node, NodeOutput, NodeType};

/// Executor for database nodes
pub struct DatabaseExecutor {
    db_pool: sqlx::PgPool,
}

impl DatabaseExecutor {
    pub fn new(db_pool: sqlx::PgPool) -> Self {
        Self { db_pool }
    }
    
    async fn execute_internal(
        &self,
        node: &Node,
        context: &mut ExecutionContext,
    ) -> Result<NodeOutput, ExecutionError> {
        // Get connection name or use default
        let connection = node.data
            .get("connection")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ExecutionError::node_error(
                &node.id,
                "Database node must have a 'connection' field"
            ))?;
        
        // Get SQL query
        let query = node.data
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ExecutionError::node_error(
                &node.id,
                "Database node must have a 'query' field"
            ))?;
        
        // Get operation type
        let operation = node.data
            .get("operation")
            .and_then(|v| v.as_str())
            .unwrap_or("select");
        
        context.log_info(&node.id, format!("Executing {} query on connection: {}", operation, connection));
        
        // Process query parameters
        let processed_query = self.replace_variables(query, context);
        
        // Execute based on operation type
        let result = match operation {
            "select" | "query" => {
                self.execute_query(node, &processed_query).await?
            }
            "insert" | "update" | "delete" => {
                self.execute_modify(node, &processed_query).await?
            }
            "transaction" => {
                self.execute_transaction(node, &processed_query).await?
            }
            _ => {
                return Err(ExecutionError::node_error(
                    &node.id,
                    format!("Unknown database operation: {}", operation)
                ));
            }
        };
        
        context.log_info(&node.id, format!("Database operation completed: {} rows affected", 
            result.get("rowsAffected").or_else(|| result.get("rowCount")).and_then(|v| v.as_u64()).unwrap_or(0)));
        
        // Store result in context
        context.set_variable(format!("{}_result", node.id), result.clone());
        context.set_variable("db_result", result.clone());
        
        Ok(NodeOutput::new(result))
    }
    
    async fn execute_query(
        &self,
        node: &Node,
        query: &str,
    ) -> Result<serde_json::Value, ExecutionError> {
        let rows = sqlx::query(query)
            .fetch_all(&self.db_pool)
            .await
            .map_err(|e| ExecutionError::node_error(&node.id, format!("Database query error: {}", e)))?;
        
        // Convert rows to JSON
        let mut results = Vec::new();
        for row in rows {
            let obj = self.row_to_json(&row)?;
            results.push(obj);
        }
        
        Ok(serde_json::json!({
            "rows": results,
            "rowCount": results.len(),
        }))
    }
    
    async fn execute_modify(
        &self,
        node: &Node,
        query: &str,
    ) -> Result<serde_json::Value, ExecutionError> {
        let result = sqlx::query(query)
            .execute(&self.db_pool)
            .await
            .map_err(|e| ExecutionError::node_error(&node.id, format!("Database modify error: {}", e)))?;
        
        Ok(serde_json::json!({
            "rowsAffected": result.rows_affected(),
        }))
    }
    
    async fn execute_transaction(
        &self,
        node: &Node,
        queries: &str,
    ) -> Result<serde_json::Value, ExecutionError> {
        // Split queries by semicolon
        let query_list: Vec<&str> = queries.split(';').filter(|s| !s.trim().is_empty()).collect();
        
        let mut tx = self.db_pool.begin().await
            .map_err(|e| ExecutionError::node_error(&node.id, format!("Transaction start error: {}", e)))?;
        
        let mut results = Vec::new();
        let mut total_affected = 0u64;
        
        for query in query_list {
            let query = query.trim();
            if query.is_empty() {
                continue;
            }
            
            // Determine if it's a SELECT query
            let is_select = query.to_uppercase().starts_with("SELECT");
            
            if is_select {
                let rows = sqlx::query(query)
                    .fetch_all(&mut *tx)
                    .await
                    .map_err(|e| ExecutionError::node_error(&node.id, format!("Transaction query error: {}", e)))?;
                
                let mut row_data = Vec::new();
                for row in rows {
                    row_data.push(self.row_to_json(&row)?);
                }
                results.push(serde_json::json!({ "rows": row_data }));
            } else {
                let result = sqlx::query(query)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| ExecutionError::node_error(&node.id, format!("Transaction modify error: {}", e)))?;
                
                total_affected += result.rows_affected();
                results.push(serde_json::json!({ "rowsAffected": result.rows_affected() }));
            }
        }
        
        tx.commit().await
            .map_err(|e| ExecutionError::node_error(&node.id, format!("Transaction commit error: {}", e)))?;
        
        Ok(serde_json::json!({
            "results": results,
            "totalAffected": total_affected,
            "committed": true,
        }))
    }
    
    fn row_to_json(&self, row: &sqlx::postgres::PgRow) -> Result<serde_json::Value, ExecutionError> {
        use sqlx::Column;
        use sqlx::TypeInfo;
        
        let mut obj = serde_json::Map::new();
        
        for (i, column) in row.columns().iter().enumerate() {
            let name = column.name();
            let type_info = column.type_info().name();
            
            // Try different types based on column type
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
                "DATE" => {
                    row.try_get::<chrono::NaiveDate, _>(i)
                        .map(|v| serde_json::json!(v.to_string()))
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
                    // Try as string for unknown types
                    row.try_get::<String, _>(i)
                        .map(serde_json::Value::String)
                        .unwrap_or(serde_json::Value::Null)
                }
            };
            
            obj.insert(name.to_string(), value);
        }
        
        Ok(serde_json::Value::Object(obj))
    }
    
    fn replace_variables(&self, query: &str, context: &ExecutionContext) -> String {
        let mut result = query.to_string();
        
        // Replace {{variable}} syntax
        for (key, value) in &context.variables {
            let placeholder = format!("{{{{{}}}}}", key);
            let replacement = match value {
                serde_json::Value::String(s) => format!("'{}'", s.replace('\\', "\\\\").replace('\'', "\\'")),
                v => v.to_string(),
            };
            result = result.replace(&placeholder, &replacement);
        }
        
        result
    }
}

#[async_trait]
impl NodeExecutor for DatabaseExecutor {
    async fn execute(
        &self,
        node: &Node,
        context: &mut ExecutionContext,
    ) -> Result<NodeOutput, ExecutionError> {
        self.execute_internal(node, context).await
    }
    
    fn node_type(&self) -> NodeType {
        NodeType::Database
    }
}
