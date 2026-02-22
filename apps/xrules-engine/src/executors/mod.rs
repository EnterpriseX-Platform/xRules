pub mod database_executor;
pub mod http_executor;
pub mod sftp_executor;
pub mod transform_executor;

pub use database_executor::DatabaseConnectionPool;
pub use http_executor::HttpConnectionPool;
pub use sftp_executor::SftpConnectionPool;
pub use transform_executor::TransformEngine;

use crate::models::{Connection, ConnectionConfig, ConnectionType, ExecutionError};
use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;

/// Trait for connection pools
#[async_trait]
pub trait ConnectionPool<T>: Send + Sync {
    async fn get_connection(&self, name: &str) -> Result<Arc<T>, ExecutionError>;
    async fn add_connection(&self, name: String, connection: Connection) -> Result<(), ExecutionError>;
    async fn remove_connection(&self, name: &str) -> Result<(), ExecutionError>;
    async fn test_connection(&self, name: &str) -> Result<bool, ExecutionError>;
    fn list_connections(&self) -> Vec<String>;
}

/// Manager for all connection pools
pub struct ConnectionPoolManager {
    database_pools: HashMap<String, Arc<DatabaseConnectionPool>>,
    http_pools: HashMap<String, Arc<HttpConnectionPool>>,
    sftp_pools: HashMap<String, Arc<SftpConnectionPool>>,
}

impl ConnectionPoolManager {
    pub fn new() -> Self {
        Self {
            database_pools: HashMap::new(),
            http_pools: HashMap::new(),
            sftp_pools: HashMap::new(),
        }
    }
    
    pub async fn register_connection(
        &mut self,
        connection: Connection,
    ) -> Result<(), ExecutionError> {
        match connection.connection_type {
            ConnectionType::Database => {
                if let ConnectionConfig::Database(config) = &connection.config {
                    let pool = DatabaseConnectionPool::new(config.clone()).await?;
                    self.database_pools.insert(
                        connection.name.clone(),
                        Arc::new(pool),
                    );
                }
            }
            ConnectionType::Http | ConnectionType::Rest => {
                if let ConnectionConfig::Http(config) = &connection.config {
                    let pool = HttpConnectionPool::new(config.clone());
                    self.http_pools.insert(
                        connection.name.clone(),
                        Arc::new(pool),
                    );
                }
            }
            ConnectionType::Sftp => {
                if let ConnectionConfig::Sftp(config) = &connection.config {
                    let pool = SftpConnectionPool::new(config.clone());
                    self.sftp_pools.insert(
                        connection.name.clone(),
                        Arc::new(pool),
                    );
                }
            }
            _ => {
                return Err(ExecutionError::connection_error(
                    format!("Unsupported connection type: {:?}", connection.connection_type)
                ));
            }
        }
        
        Ok(())
    }
    
    pub fn get_database_pool(&self, name: &str) -> Option<Arc<DatabaseConnectionPool>> {
        self.database_pools.get(name).cloned()
    }
    
    pub fn get_http_pool(&self, name: &str) -> Option<Arc<HttpConnectionPool>> {
        self.http_pools.get(name).cloned()
    }
    
    pub fn get_sftp_pool(&self, name: &str) -> Option<Arc<SftpConnectionPool>> {
        self.sftp_pools.get(name).cloned()
    }
    
    pub async fn test_connection(&self, name: &str) -> Result<bool, ExecutionError> {
        if let Some(pool) = self.database_pools.get(name) {
            return pool.test_connection(name).await;
        }
        if let Some(pool) = self.http_pools.get(name) {
            return pool.test_connection(name).await;
        }
        if let Some(pool) = self.sftp_pools.get(name) {
            return pool.test_connection(name).await;
        }
        Err(ExecutionError::connection_error(format!("Connection not found: {}", name)))
    }
}

impl Default for ConnectionPoolManager {
    fn default() -> Self {
        Self::new()
    }
}
