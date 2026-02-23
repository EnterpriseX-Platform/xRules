use crate::api::HealthResponse;
use axum::Json;

/// Health check endpoint
/// 
/// Returns the current health status of the XRules Engine Hub
/// and lists all available engines.
#[utoipa::path(
    get,
    path = "/health",
    tag = "Health",
    responses(
        (status = 200, description = "Service is healthy", body = HealthResponse),
        (status = 503, description = "Service is unavailable", body = ErrorResponse)
    )
)]
pub async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "healthy".to_string(),
        service: "xrules-engine-hub".to_string(),
        version: "0.1.0".to_string(),
        engines: vec![
            "rules".to_string(),
            "pmml".to_string(),
            "ml".to_string(),
            "llm".to_string(),
            "ai".to_string(),
        ],
    })
}
