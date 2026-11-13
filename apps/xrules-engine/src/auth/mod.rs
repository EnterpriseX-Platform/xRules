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

// Auth endpoints removed - authentication is handled by Studio Backend.
// Engine Hub only validates tokens, does not issue them.

/// Error response for auth endpoints
#[derive(Debug, Serialize, ToSchema)]
pub struct ErrorResponse {
    pub error: String,
    pub message: String,
}
