use crate::api::ApiDoc;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

/// Create Swagger UI route
///
/// Serves interactive API documentation at `/docs`
pub fn swagger_ui() -> SwaggerUi {
    SwaggerUi::new("/docs").url("/api-docs/openapi.json", ApiDoc::openapi())
}

/// Export OpenAPI spec as JSON string
pub fn export_openapi_json() -> String {
    ApiDoc::openapi().to_pretty_json().unwrap_or_default()
}

/// Export OpenAPI spec as YAML string
/// Note: Manual conversion since utoipa v4 doesn't have built-in YAML support
pub fn export_openapi_yaml() -> String {
    let json = export_openapi_json();
    // Simple conversion - in production, use a proper JSON to YAML converter
    format!("# OpenAPI specification in YAML format\n# Convert from JSON using: https://editor.swagger.io/\n\n{}", json)
}
