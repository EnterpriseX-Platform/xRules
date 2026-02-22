use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use uuid::Uuid;

use crate::models::Flow;
use crate::stores::{Cache, KeyBuilder};

/// Store for rules/flows with caching
#[async_trait]
pub trait RuleStore: Send + Sync {
    async fn get_flow(&self, flow_id: Uuid) -> crate::Result<Option<Flow>>;
    async fn save_flow(&self, flow: &Flow) -> crate::Result<()>;
    async fn delete_flow(&self, flow_id: Uuid) -> crate::Result<()>;
    async fn list_flows_by_project(&self, project_id: Uuid) -> crate::Result<Vec<Flow>>;
    async fn invalidate(&self, flow_id: Uuid) -> crate::Result<()>;
}

/// Redis-backed rule store
pub struct RedisRuleStore {
    cache: Box<dyn Cache>,
    key_builder: KeyBuilder,
    ttl_seconds: u64,
}

impl RedisRuleStore {
    pub fn new(cache: Box<dyn Cache>) -> Self {
        Self {
            cache,
            key_builder: KeyBuilder::new("xrules"),
            ttl_seconds: 3600, // 1 hour default
        }
    }
    
    pub fn with_ttl(mut self, ttl_seconds: u64) -> Self {
        self.ttl_seconds = ttl_seconds;
        self
    }
}

#[async_trait]
impl RuleStore for RedisRuleStore {
    async fn get_flow(&self, flow_id: Uuid) -> crate::Result<Option<Flow>> {
        let key = self.key_builder.flow(flow_id);
        
        if let Some(value) = self.cache.get(&key).await? {
            let flow: Flow = serde_json::from_str(&value)?;
            Ok(Some(flow))
        } else {
            Ok(None)
        }
    }
    
    async fn save_flow(&self, flow: &Flow) -> crate::Result<()> {
        let key = self.key_builder.flow(flow.id);
        let value = serde_json::to_string(flow)?;
        
        self.cache.set(&key, &value, Some(self.ttl_seconds)).await?;
        Ok(())
    }
    
    async fn delete_flow(&self, flow_id: Uuid) -> crate::Result<()> {
        let key = self.key_builder.flow(flow_id);
        self.cache.delete(&key).await?;
        Ok(())
    }
    
    async fn list_flows_by_project(&self, _project_id: Uuid) -> crate::Result<Vec<Flow>> {
        // In a real implementation, this would use Redis SCAN or maintain an index
        // For now, return empty
        Ok(Vec::new())
    }
    
    async fn invalidate(&self, flow_id: Uuid) -> crate::Result<()> {
        self.delete_flow(flow_id).await
    }
}

/// Cached rule store that wraps another store
pub struct CachedRuleStore<S: RuleStore> {
    inner: S,
    cache: Box<dyn Cache>,
    key_builder: KeyBuilder,
    ttl_seconds: u64,
}

impl<S: RuleStore> CachedRuleStore<S> {
    pub fn new(inner: S, cache: Box<dyn Cache>) -> Self {
        Self {
            inner,
            cache,
            key_builder: KeyBuilder::new("xrules"),
            ttl_seconds: 3600,
        }
    }
    
    pub fn with_ttl(mut self, ttl_seconds: u64) -> Self {
        self.ttl_seconds = ttl_seconds;
        self
    }
}

#[async_trait]
impl<S: RuleStore> RuleStore for CachedRuleStore<S> {
    async fn get_flow(&self, flow_id: Uuid) -> crate::Result<Option<Flow>> {
        let key = self.key_builder.flow(flow_id);
        
        // Try cache first
        if let Some(value) = self.cache.get(&key).await? {
            let flow: Flow = serde_json::from_str(&value)?;
            return Ok(Some(flow));
        }
        
        // Fetch from inner store
        if let Some(flow) = self.inner.get_flow(flow_id).await? {
            // Cache the result
            let value = serde_json::to_string(&flow)?;
            let _ = self.cache.set(&key, &value, Some(self.ttl_seconds)).await;
            Ok(Some(flow))
        } else {
            Ok(None)
        }
    }
    
    async fn save_flow(&self, flow: &Flow) -> crate::Result<()> {
        // Save to inner store
        self.inner.save_flow(flow).await?;
        
        // Update cache
        let key = self.key_builder.flow(flow.id);
        let value = serde_json::to_string(flow)?;
        let _ = self.cache.set(&key, &value, Some(self.ttl_seconds)).await;
        
        Ok(())
    }
    
    async fn delete_flow(&self, flow_id: Uuid) -> crate::Result<()> {
        // Delete from inner store
        self.inner.delete_flow(flow_id).await?;
        
        // Invalidate cache
        let key = self.key_builder.flow(flow_id);
        let _ = self.cache.delete(&key).await;
        
        Ok(())
    }
    
    async fn list_flows_by_project(&self, project_id: Uuid) -> crate::Result<Vec<Flow>> {
        // For lists, we don't cache - just pass through
        self.inner.list_flows_by_project(project_id).await
    }
    
    async fn invalidate(&self, flow_id: Uuid) -> crate::Result<()> {
        let key = self.key_builder.flow(flow_id);
        self.cache.delete(&key).await?;
        self.inner.invalidate(flow_id).await
    }
}

/// Flow cache entry with expiration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowCacheEntry {
    pub flow: Flow,
    pub cached_at: chrono::DateTime<chrono::Utc>,
    pub ttl_seconds: u64,
}

impl FlowCacheEntry {
    pub fn new(flow: Flow, ttl_seconds: u64) -> Self {
        Self {
            flow,
            cached_at: chrono::Utc::now(),
            ttl_seconds,
        }
    }
    
    pub fn is_expired(&self) -> bool {
        let elapsed = chrono::Utc::now().signed_duration_since(self.cached_at);
        elapsed.num_seconds() > self.ttl_seconds as i64
    }
}

/// In-memory flow cache for hot paths
pub struct InMemoryFlowCache {
    cache: std::sync::Arc<tokio::sync::RwLock<std::collections::HashMap<Uuid, FlowCacheEntry>>>,
    default_ttl: Duration,
}

impl InMemoryFlowCache {
    pub fn new(default_ttl: Duration) -> Self {
        Self {
            cache: std::sync::Arc::new(tokio::sync::RwLock::new(std::collections::HashMap::new())),
            default_ttl,
        }
    }
    
    pub async fn get(&self, flow_id: Uuid) -> Option<Flow> {
        let cache = self.cache.read().await;
        
        if let Some(entry) = cache.get(&flow_id) {
            if !entry.is_expired() {
                return Some(entry.flow.clone());
            }
        }
        
        None
    }
    
    pub async fn set(&self, flow: Flow) {
        let entry = FlowCacheEntry::new(flow.clone(), self.default_ttl.as_secs());
        let mut cache = self.cache.write().await;
        cache.insert(flow.id, entry);
    }
    
    pub async fn invalidate(&self, flow_id: Uuid) {
        let mut cache = self.cache.write().await;
        cache.remove(&flow_id);
    }
    
    pub async fn clear(&self) {
        let mut cache = self.cache.write().await;
        cache.clear();
    }
    
    pub async fn cleanup_expired(&self) {
        let mut cache = self.cache.write().await;
        cache.retain(|_, entry| !entry.is_expired());
    }
}
