use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::broadcast;
use tonic::{Request, Response, Status};

/// Health check service
pub struct HealthService {
    serving: AtomicBool,
    shutdown_tx: broadcast::Sender<()>,
}

impl HealthService {
    pub fn new() -> Self {
        let (shutdown_tx, _) = broadcast::channel(1);
        Self {
            serving: AtomicBool::new(true),
            shutdown_tx,
        }
    }
    
    pub fn set_serving(&self, serving: bool) {
        self.serving.store(serving, Ordering::SeqCst);
    }
    
    pub fn shutdown(&self) {
        let _ = self.shutdown_tx.send(());
    }
}

impl Default for HealthService {
    fn default() -> Self {
        Self::new()
    }
}

/// Health check utilities
pub mod checks {
    /// Check database connectivity
    pub async fn check_database(pool: &sqlx::PgPool) -> bool {
        match sqlx::query("SELECT 1").fetch_one(pool).await {
            Ok(_) => true,
            Err(e) => {
                tracing::error!("Database health check failed: {}", e);
                false
            }
        }
    }
    
    /// Check Redis connectivity
    pub async fn check_redis(redis: &fred::clients::RedisPool) -> bool {
        match redis.ping::<String>().await {
            Ok(_) => true,
            Err(e) => {
                tracing::error!("Redis health check failed: {}", e);
                false
            }
        }
    }
}
