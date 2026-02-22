use anyhow::Result;
use std::sync::Arc;
use tracing::{info, error};

mod config;
mod engine;
mod executors;
mod models;
mod nodes;
mod server;
mod stores;
mod utils;

use crate::config::Config;
use crate::server::GrpcServer;

#[tokio::main]
async fn main() -> Result<()> {
    // Load configuration
    let config = Config::from_env()?;
    
    // Initialize tracing
    init_tracing(&config);
    
    info!("Starting XRules Engine v{}", env!("CARGO_PKG_VERSION"));
    info!("Configuration loaded successfully");
    
    // Create shared state
    let state = Arc::new(AppState::new(config.clone()).await?);
    
    // Start metrics server if enabled
    let metrics_handle = if config.metrics.enabled {
        let state = Arc::clone(&state);
        Some(tokio::spawn(start_metrics_server(state)))
    } else {
        None
    };
    
    // Start gRPC server
    let grpc_handle = tokio::spawn(start_grpc_server(state));
    
    // Wait for shutdown signal
    tokio::select! {
        result = grpc_handle => {
            if let Err(e) = result {
                error!("gRPC server error: {:?}", e);
            }
        }
        _ = tokio::signal::ctrl_c() => {
            info!("Received shutdown signal");
        }
    }
    
    if let Some(handle) = metrics_handle {
        let _ = handle.await;
    }
    
    info!("XRules Engine shutdown complete");
    Ok(())
}

pub struct AppState {
    pub config: Config,
    pub db_pool: sqlx::PgPool,
    pub redis: Option<fred::clients::RedisPool>,
}

impl AppState {
    pub async fn new(config: Config) -> Result<Self> {
        // Initialize database pool
        let db_pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(config.database.max_connections)
            .min_connections(config.database.min_connections)
            .acquire_timeout(std::time::Duration::from_secs(config.database.connect_timeout))
            .connect(&config.database.url)
            .await?;
        
        info!("Database pool initialized");
        
        // Initialize Redis if URL is provided
        let redis = if config.features.enable_caching {
            match Self::init_redis(&config.redis).await {
                Ok(pool) => {
                    info!("Redis pool initialized");
                    Some(pool)
                }
                Err(e) => {
                    error!("Failed to connect to Redis: {}", e);
                    None
                }
            }
        } else {
            None
        };
        
        Ok(Self {
            config,
            db_pool,
            redis,
        })
    }
    
    async fn init_redis(config: &crate::config::RedisConfig) -> Result<fred::clients::RedisPool> {
        let redis_config = fred::types::config::RedisConfig::from_url(&config.url)?;
        let perf = fred::types::config::PerformanceConfig::default();
        let policy = fred::types::config::ReconnectPolicy::default();
        
        let pool = fred::clients::RedisPool::new(
            redis_config,
            Some(perf),
            Some(policy),
            config.pool_size,
        )?;
        
        pool.connect();
        pool.wait_for_connect().await?;
        
        Ok(pool)
    }
}

fn init_tracing(config: &Config) {
    use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
    
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(&config.log.level));
    
    let fmt_layer = tracing_subscriber::fmt::layer()
        .with_target(true)
        .with_thread_ids(true);
    
    let fmt_layer = if config.log.format == "json" {
        fmt_layer.json().boxed()
    } else {
        fmt_layer.compact().boxed()
    };
    
    tracing_subscriber::registry()
        .with(env_filter)
        .with(fmt_layer)
        .init();
}

async fn start_grpc_server(state: Arc<AppState>) -> Result<()> {
    let addr = state.config.grpc_addr().parse()?;
    let server = GrpcServer::new(state).await?;
    server.start(addr).await?;
    Ok(())
}

async fn start_metrics_server(state: Arc<AppState>) -> Result<()> {
    use axum::{routing::get, Router};
    use metrics_exporter_prometheus::PrometheusBuilder;
    
    let builder = PrometheusBuilder::new();
    builder.install_recorder()?;
    
    let app = Router::new()
        .route(&state.config.metrics.endpoint, get(metrics_handler));
    
    let addr = state.config.metrics_addr().parse()?;
    info!("Metrics server starting on {}", addr);
    
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    
    Ok(())
}

async fn metrics_handler() -> String {
    metrics_exporter_prometheus::PrometheusHandle::render()
}
