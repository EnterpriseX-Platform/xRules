pub mod execution_store;
pub mod log_store;
pub mod rule_store;

pub use execution_store::{ExecutionStore, PostgresExecutionStore};
pub use log_store::{LogStore, PostgresLogStore};
pub use rule_store::{RuleStore, RedisRuleStore};

use async_trait::async_trait;
use uuid::Uuid;

/// Trait for cache operations
#[async_trait]
pub trait Cache: Send + Sync {
    async fn get(&self, key: &str) -> crate::Result<Option<String>>;
    async fn set(&self, key: &str, value: &str, ttl_seconds: Option<u64>) -> crate::Result<()>;
    async fn delete(&self, key: &str) -> crate::Result<()>;
    async fn exists(&self, key: &str) -> crate::Result<bool>;
}

/// Redis cache implementation
pub struct RedisCache {
    client: fred::clients::RedisPool,
}

impl RedisCache {
    pub fn new(client: fred::clients::RedisPool) -> Self {
        Self { client }
    }
}

#[async_trait]
impl Cache for RedisCache {
    async fn get(&self, key: &str) -> crate::Result<Option<String>> {
        let value: Option<String> = self.client.get(key).await?;
        Ok(value)
    }
    
    async fn set(&self, key: &str, value: &str, ttl_seconds: Option<u64>) -> crate::Result<()> {
        if let Some(ttl) = ttl_seconds {
            self.client.set(key, value, Some(fred::types::Expiration::EX(ttl as i64)), None, false).await?;
        } else {
            self.client.set(key, value, None, None, false).await?;
        }
        Ok(())
    }
    
    async fn delete(&self, key: &str) -> crate::Result<()> {
        self.client.del(key).await?;
        Ok(())
    }
    
    async fn exists(&self, key: &str) -> crate::Result<bool> {
        let exists: i64 = self.client.exists(key).await?;
        Ok(exists > 0)
    }
}

/// Key builder for cache keys
pub struct KeyBuilder {
    prefix: String,
}

impl KeyBuilder {
    pub fn new(prefix: impl Into<String>) -> Self {
        Self {
            prefix: prefix.into(),
        }
    }
    
    pub fn flow(&self, flow_id: Uuid) -> String {
        format!("{}:flow:{}", self.prefix, flow_id)
    }
    
    pub fn execution(&self, execution_id: Uuid) -> String {
        format!("{}:execution:{}", self.prefix, execution_id)
    }
    
    pub fn execution_logs(&self, execution_id: Uuid) -> String {
        format!("{}:execution:{}:logs", self.prefix, execution_id)
    }
    
    pub fn connection(&self, project_id: Uuid, name: &str) -> String {
        format!("{}:connection:{}:{}", self.prefix, project_id, name)
    }
    
    pub fn rule(&self, rule_id: Uuid) -> String {
        format!("{}:rule:{}", self.prefix, rule_id)
    }
    
    pub fn custom(&self, parts: &[&str]) -> String {
        format!("{}:{}", self.prefix, parts.join(":"))
    }
}
