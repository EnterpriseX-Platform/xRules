use axum::{
    middleware,
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tracing::{info, error};

mod api;
mod auth;
mod engines;
mod grpc;
mod hub;
mod protocol;
mod standards;

use api::docs::swagger_ui;
use api::{
    engines::{get_engine_standards, list_engines},
    execute::execute_rule,
    health::health_check,
    validate::validate_rule,
};
use auth::middleware::{auth_middleware, AuthConfig};
use hub::EngineHub;

#[derive(Clone)]
pub struct AppState {
    pub hub: Arc<EngineHub>,
    pub auth_config: Arc<AuthConfig>,
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    info!("Starting XRules Engine Hub...");

    // Initialize Engine Hub (no DB needed)
    let hub = Arc::new(
        EngineHub::new()
            .await
            .expect("Failed to initialize engine hub"),
    );

    // Auth config for validating tokens from Studio Backend
    let auth_config = Arc::new(AuthConfig::from_env());

    let state = AppState {
        hub: hub.clone(),
        auth_config: auth_config.clone(),
    };

    // Internal routes (no auth - called by Studio Backend which handles auth)
    let internal_routes = Router::new()
        .route("/health", get(health_check))
        .route("/execute", post(execute_rule))
        .route("/validate", post(validate_rule))
        .route("/engines", get(list_engines))
        .route("/engines/:engine_type/standards", get(get_engine_standards))
        .with_state(state.clone());

    // Main app with Swagger UI
    let app = Router::new()
        .merge(swagger_ui())
        .nest("/api/v1", internal_routes)
        .layer(CorsLayer::permissive());

    let http_port = std::env::var("PORT")
        .unwrap_or_else(|_| "50051".to_string())
        .parse::<u16>()
        .expect("PORT must be a number");

    let grpc_port = std::env::var("GRPC_PORT")
        .unwrap_or_else(|_| "50060".to_string())
        .parse::<u16>()
        .expect("GRPC_PORT must be a number");

    info!("XRules Engine Hub starting...");
    info!("HTTP API: http://0.0.0.0:{}", http_port);
    info!("gRPC API: http://0.0.0.0:{}", grpc_port);
    info!("Swagger UI: http://0.0.0.0:{}/docs", http_port);

    // Start both HTTP and gRPC servers
    let http_server = tokio::spawn(async move {
        let addr = SocketAddr::from(([0, 0, 0, 0], http_port));
        let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
        info!("HTTP server listening on {}", addr);
        axum::serve(listener, app).await.unwrap();
    });

    let grpc_server = tokio::spawn(async move {
        if let Err(e) = grpc::server::start_grpc_server(hub, grpc_port).await {
            error!("gRPC server error: {}", e);
        }
    });

    // Wait for both servers
    tokio::select! {
        _ = http_server => {},
        _ = grpc_server => {},
    }
}
