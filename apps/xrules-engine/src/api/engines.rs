use crate::api::{EngineInfo, EngineStatus, ErrorResponse, Standard};
use crate::hub::EngineType;
use crate::AppState;
use axum::{
    extract::{Path, State},
    Json,
};

/// List all available engines
#[utoipa::path(
    get,
    path = "/engines",
    tag = "Engines",
    responses(
        (status = 200, description = "List of engines", body = Vec<EngineInfo>),
        (status = 500, description = "Internal server error", body = ErrorResponse)
    ),
    security(
        ("bearer_auth" = [])
    )
)]
pub async fn list_engines(State(state): State<AppState>) -> Json<Vec<EngineInfo>> {
    let engines = state.hub.list_engines().await;

    engines
        .into_iter()
        .map(|e| EngineInfo {
            name: e.name,
            engine_type: e.engine_type,
            status: match e.status.as_str() {
                "healthy" => EngineStatus::Healthy,
                _ => EngineStatus::Unhealthy,
            },
            standards: e.standards,
            version: e.version,
        })
        .collect::<Vec<_>>()
        .into()
}

/// Get engine supported standards
#[utoipa::path(
    get,
    path = "/engines/{engine_type}/standards",
    tag = "Engines",
    params(
        ("engine_type" = String, Path, description = "Engine type (rules, pmml, ml, llm, ai)")
    ),
    responses(
        (status = 200, description = "Engine standards", body = Vec<Standard>),
        (status = 404, description = "Engine not found", body = ErrorResponse)
    ),
    security(
        ("bearer_auth" = [])
    )
)]
pub async fn get_engine_standards(
    State(state): State<AppState>,
    Path(engine_type): Path<String>,
) -> Result<Json<Vec<Standard>>, Json<ErrorResponse>> {
    let engine_type = match EngineType::from_str(&engine_type) {
        Ok(t) => t,
        Err(e) => {
            return Err(Json(ErrorResponse {
                status: 404,
                error: "NOT_FOUND".to_string(),
                message: e,
                request_id: format!("req-{}", uuid::Uuid::new_v4()),
                details: None,
            }));
        }
    };

    let standards = state.hub.get_engine_standards(engine_type).await;

    Ok(Json(
        standards
            .into_iter()
            .map(|s| Standard {
                name: s.name,
                version: s.version,
                description: s.description,
            })
            .collect(),
    ))
}
