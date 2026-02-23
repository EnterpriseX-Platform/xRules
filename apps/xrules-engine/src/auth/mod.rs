pub mod claims;
pub mod middleware;
pub mod errors;
pub mod service;

use crate::auth::claims::{Claims, Role};
use crate::auth::errors::AuthError;
use crate::auth::service::AuthService;
use crate::AppState;
use axum::{
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::ToSchema;

/// Login request
#[derive(Debug, Deserialize, ToSchema)]
pub struct LoginRequest {
    /// Username or email
    #[schema(example = "admin@xrules.io")]
    pub username: String,
    
    /// Password
    #[schema(example = "secure_password")]
    pub password: String,
}

/// Login response
#[derive(Debug, Serialize, ToSchema)]
pub struct LoginResponse {
    /// JWT access token
    #[schema(example = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...")]
    pub access_token: String,
    
    /// JWT refresh token
    #[schema(example = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...")]
    pub refresh_token: String,
    
    /// Token type (Bearer)
    #[schema(example = "Bearer")]
    pub token_type: String,
    
    /// Access token expiration time in seconds
    #[schema(example = 3600)]
    pub expires_in: i64,
    
    /// User information
    pub user: UserInfo,
}

/// User information
#[derive(Debug, Serialize, ToSchema)]
pub struct UserInfo {
    /// User ID
    #[schema(example = "550e8400-e29b-41d4-a716-446655440000")]
    pub id: String,
    
    /// Username
    #[schema(example = "admin")]
    pub username: String,
    
    /// Email
    #[schema(example = "admin@xrules.io")]
    pub email: String,
    
    /// User roles
    #[schema(example = json![["Admin", "Editor"]])]
    pub roles: Vec<String>,
}

/// Refresh token request
#[derive(Debug, Deserialize, ToSchema)]
pub struct RefreshRequest {
    /// Refresh token
    #[schema(example = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...")]
    pub refresh_token: String,
}

/// Logout request
#[derive(Debug, Deserialize, ToSchema)]
pub struct LogoutRequest {
    /// Access token to revoke (optional)
    #[schema(example = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...")]
    pub token: Option<String>,
}

/// Login endpoint
/// 
/// Authenticates a user and returns JWT tokens.
#[utoipa::path(
    post,
    path = "/auth/login",
    tag = "Authentication",
    request_body = LoginRequest,
    responses(
        (
            status = 200,
            description = "Login successful",
            body = LoginResponse
        ),
        (
            status = 401,
            description = "Invalid credentials",
            body = ErrorResponse
        ),
        (
            status = 429,
            description = "Too many login attempts"
        )
    )
)]
pub async fn login(
    axum::extract::State(state): axum::extract::State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, AuthError> {
    let (access_token, refresh_token, claims) = state.auth_service.authenticate(&req.username, &req.password).await?;
    
    Ok(Json(LoginResponse {
        access_token,
        refresh_token,
        token_type: "Bearer".to_string(),
        expires_in: state.auth_service.access_token_expiry(),
        user: UserInfo {
            id: claims.sub.clone(),
            username: claims.username.clone(),
            email: claims.email.clone(),
            roles: claims.roles.iter().map(|r| r.to_string()).collect(),
        },
    }))
}

/// Refresh token endpoint
/// 
/// Uses a refresh token to get a new access token.
#[utoipa::path(
    post,
    path = "/auth/refresh",
    tag = "Authentication",
    request_body = RefreshRequest,
    responses(
        (
            status = 200,
            description = "Token refreshed successfully",
            body = LoginResponse
        ),
        (
            status = 401,
            description = "Invalid refresh token",
            body = ErrorResponse
        )
    )
)]
pub async fn refresh_token(
    axum::extract::State(state): axum::extract::State<AppState>,
    Json(req): Json<RefreshRequest>,
) -> Result<Json<LoginResponse>, AuthError> {
    let (access_token, refresh_token, claims) = state.auth_service.refresh(&req.refresh_token).await?;
    
    Ok(Json(LoginResponse {
        access_token,
        refresh_token,
        token_type: "Bearer".to_string(),
        expires_in: state.auth_service.access_token_expiry(),
        user: UserInfo {
            id: claims.sub.clone(),
            username: claims.username.clone(),
            email: claims.email.clone(),
            roles: claims.roles.iter().map(|r| r.to_string()).collect(),
        },
    }))
}

/// Logout endpoint
/// 
/// Revokes the current token.
#[utoipa::path(
    post,
    path = "/auth/logout",
    tag = "Authentication",
    request_body = LogoutRequest,
    responses(
        (status = 200, description = "Logout successful"),
        (status = 401, description = "Unauthorized")
    ),
    security(
        ("bearer_auth" = [])
    )
)]
pub async fn logout(
    axum::extract::State(state): axum::extract::State<AppState>,
    axum::extract::Extension(_claims): axum::extract::Extension<Claims>,
    Json(req): Json<LogoutRequest>,
) -> Result<Json<serde_json::Value>, AuthError> {
    // Revoke token
    if let Some(token) = req.token {
        state.auth_service.revoke(&token).await?;
    }
    
    Ok(Json(serde_json::json!({
        "message": "Logout successful"
    })))
}

/// Error response for auth endpoints
#[derive(Debug, Serialize, ToSchema)]
pub struct ErrorResponse {
    pub error: String,
    pub message: String,
}
