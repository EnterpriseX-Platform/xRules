use crate::api::{ErrorResponse, ValidateRequest, ValidateResponse};
use crate::AppState;
use axum::{extract::State, http::StatusCode, Json};

/// Validate a rule
/// 
/// Validates a rule definition without executing it.
#[utoipa::path(
    post,
    path = "/validate",
    tag = "Validation",
    request_body = ValidateRequest,
    responses(
        (status = 200, description = "Validation result", body = ValidateResponse),
        (status = 404, description = "Rule not found", body = ErrorResponse),
        (status = 500, description = "Internal server error", body = ErrorResponse)
    ),
    security(
        ("bearer_auth" = [])
    )
)]
pub async fn validate_rule(
    State(state): State<AppState>,
    Json(req): Json<ValidateRequest>,
) -> Result<Json<ValidateResponse>, (StatusCode, Json<ErrorResponse>)> {
    match state.hub.validate(&req.rule_id).await {
        Ok(_) => Ok(Json(ValidateResponse {
            valid: true,
            errors: vec![],
        })),
        Err(e) => {
            let (status, error_code) = match e {
                crate::hub::HubError::RuleNotFound(_) => (StatusCode::NOT_FOUND, "NOT_FOUND"),
                crate::hub::HubError::Validation(_) => {
                    return Ok(Json(ValidateResponse {
                        valid: false,
                        errors: vec![e.to_string()],
                    }));
                }
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
