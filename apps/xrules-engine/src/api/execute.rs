use crate::api::{ErrorResponse, ExecuteRequest, ExecuteResponse};
use crate::hub::ExecuteRequest as HubExecuteRequest;
use crate::AppState;
use axum::{extract::State, http::StatusCode, Json};

/// Execute a rule
/// 
/// Executes a rule with the given input data. The engine hub will automatically
/// route the request to the appropriate engine based on the rule's configuration.
#[utoipa::path(
    post,
    path = "/execute",
    tag = "Execution",
    request_body = ExecuteRequest,
    responses(
        (status = 200, description = "Rule executed successfully", body = ExecuteResponse),
        (status = 400, description = "Invalid request", body = ErrorResponse),
        (status = 404, description = "Rule not found", body = ErrorResponse),
        (status = 422, description = "Rule validation failed", body = ErrorResponse),
        (status = 500, description = "Internal server error", body = ErrorResponse)
    ),
    security(
        ("bearer_auth" = [])
    )
)]
pub async fn execute_rule(
    State(state): State<AppState>,
    Json(req): Json<ExecuteRequest>,
) -> Result<Json<ExecuteResponse>, (StatusCode, Json<ErrorResponse>)> {
    let start = std::time::Instant::now();
    
    let hub_req = HubExecuteRequest {
        rule_id: req.rule_id,
        input: req.input,
        context: req.context,
    };
    
    match state.hub.execute(hub_req).await {
        Ok(output) => Ok(Json(ExecuteResponse {
            success: true,
            output: Some(output),
            error: None,
            duration_ms: start.elapsed().as_millis() as u64,
            engine_used: Some("rules".to_string()),
        })),
        Err(e) => {
            let (status, error_code) = match e {
                crate::hub::HubError::RuleNotFound(_) => (StatusCode::NOT_FOUND, "NOT_FOUND"),
                crate::hub::HubError::Validation(_) => (StatusCode::UNPROCESSABLE_ENTITY, "VALIDATION_ERROR"),
                crate::hub::HubError::EngineNotFound(_) => (StatusCode::BAD_REQUEST, "ENGINE_NOT_FOUND"),
                _ => (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR"),
            };
            
            Err((status, Json(ErrorResponse {
                status: status.as_u16(),
                error: error_code.to_string(),
                message: e.to_string(),
                request_id: format!("req-{}", uuid::Uuid::new_v4()),
                details: None,
            })))
        }
    }
}
