use crate::api::{ErrorResponse, ValidateRequest, ValidateResponse};
use crate::hub::RulePayload as HubRulePayload;
use crate::AppState;
use axum::{extract::State, http::StatusCode, Json};

/// Validate a rule
///
/// Validates an inline rule definition without executing it.
#[utoipa::path(
    post,
    path = "/validate",
    tag = "Validation",
    request_body = ValidateRequest,
    responses(
        (status = 200, description = "Validation result", body = ValidateResponse),
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
    let hub_payload = HubRulePayload {
        rule_type: req.rule.rule_type,
        engine: req.rule.engine,
        definition: req.rule.definition,
    };

    match state.hub.validate_rule(&hub_payload).await {
        Ok(_) => Ok(Json(ValidateResponse {
            valid: true,
            errors: vec![],
        })),
        Err(e) => {
            if matches!(e, crate::hub::HubError::Validation(_)) {
                return Ok(Json(ValidateResponse {
                    valid: false,
                    errors: vec![e.to_string()],
                }));
            }

            let status = StatusCode::INTERNAL_SERVER_ERROR;
            Err((status, Json(ErrorResponse {
                status: status.as_u16(),
                error: "INTERNAL_ERROR".to_string(),
                message: e.to_string(),
                request_id: format!("req-{}", uuid::Uuid::new_v4()),
                details: None,
            })))
        }
    }
}
