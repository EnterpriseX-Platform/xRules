use axum::{
    middleware,
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tracing::info;

mod api;
mod auth;
mod engines;
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
use auth::service::AuthService;
use hub::EngineHub;

#[derive(Clone)]
pub struct AppState {
    pub hub: Arc<EngineHub>,
    pub auth_service: Arc<AuthService>,
    pub auth_config: Arc<AuthConfig>,
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    
    info!("Starting XRules Engine Hub...");
    
    // Initialize Engine Hub
    let hub = Arc::new(
        EngineHub::new()
            .await
            .expect("Failed to initialize engine hub"),
    );
    
    // Initialize Auth Service
    let auth_config = Arc::new(AuthConfig::from_env());
    let auth_service = Arc::new(AuthService::new(auth_config.clone()));
    
    let state = AppState {
        hub,
        auth_service: auth_service.clone(),
        auth_config: auth_config.clone(),
    };
    
    // Public routes (no auth required)
    let public_routes = Router::new()
        .route("/health", get(health_check))
        .route("/auth/login", post(auth::login))
        .route("/auth/refresh", post(auth::refresh_token))
        .route("/auth/logout", post(auth::logout))
        .with_state(state.clone());
    
    // Protected routes (auth required)
    let protected_routes = Router::new()
        .route("/execute", post(execute_rule))
        .route("/validate", post(validate_rule))
        .route("/engines", get(list_engines))
        .route("/engines/:engine_type/standards", get(get_engine_standards))
        .layer(middleware::from_fn_with_state(
            auth_config.clone(),
            auth_middleware,
        ))
        .with_state(state.clone());
    
    // Main app with Swagger UI
    let app = Router::new()
        .merge(swagger_ui())
        .nest("/api/v1", public_routes)
        .nest("/api/v1", protected_routes)
        .layer(CorsLayer::permissive());
    
    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "50051".to_string())
        .parse::<u16>()
        .expect("PORT must be a number");
    
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("XRules Engine Hub listening on {}", addr);
    info!("Swagger UI available at http://{}/docs", addr);
    info!("OpenAPI spec available at http://{}/api-docs/openapi.json", addr);
    info!("Auth endpoints:");
    info!("  POST http://{}/api/v1/auth/login", addr);
    info!("  POST http://{}/api/v1/auth/refresh", addr);
    info!("  POST http://{}/api/v1/auth/refresh", addr);
    
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
