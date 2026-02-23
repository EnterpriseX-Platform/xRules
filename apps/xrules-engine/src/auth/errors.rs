use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

/// Authentication errors
#[derive(Error, Debug)]
pub enum AuthError {
    #[error("Invalid credentials")]
    InvalidCredentials,
    
    #[error("Token expired")]
    TokenExpired,
    
    #[error("Invalid token")]
    InvalidToken,
    
    #[error("Token revoked")]
    TokenRevoked,
    
    #[error("Insufficient permissions")]
    InsufficientPermissions,
    
    #[error("Missing authorization header")]
    MissingAuthorization,
    
    #[error("Invalid authorization format")]
    InvalidAuthorizationFormat,
    
    #[error("User not found")]
    UserNotFound,
    
    #[error("Account disabled")]
    AccountDisabled,
    
    #[error("Rate limit exceeded")]
    RateLimitExceeded,
    
    #[error("Internal error: {0}")]
    Internal(String),
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let (status, error_code) = match self {
            AuthError::InvalidCredentials => (StatusCode::UNAUTHORIZED, "INVALID_CREDENTIALS"),
            AuthError::TokenExpired => (StatusCode::UNAUTHORIZED, "TOKEN_EXPIRED"),
            AuthError::InvalidToken => (StatusCode::UNAUTHORIZED, "INVALID_TOKEN"),
            AuthError::TokenRevoked => (StatusCode::UNAUTHORIZED, "TOKEN_REVOKED"),
            AuthError::InsufficientPermissions => (StatusCode::FORBIDDEN, "INSUFFICIENT_PERMISSIONS"),
            AuthError::MissingAuthorization => (StatusCode::UNAUTHORIZED, "MISSING_AUTHORIZATION"),
            AuthError::InvalidAuthorizationFormat => (StatusCode::BAD_REQUEST, "INVALID_AUTHORIZATION_FORMAT"),
            AuthError::UserNotFound => (StatusCode::NOT_FOUND, "USER_NOT_FOUND"),
            AuthError::AccountDisabled => (StatusCode::FORBIDDEN, "ACCOUNT_DISABLED"),
            AuthError::RateLimitExceeded => (StatusCode::TOO_MANY_REQUESTS, "RATE_LIMIT_EXCEEDED"),
            AuthError::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR"),
        };
        
        let body = Json(json!({
            "error": error_code,
            "message": self.to_string(),
        }));
        
        (status, body).into_response()
    }
}

impl From<jsonwebtoken::errors::Error> for AuthError {
    fn from(e: jsonwebtoken::errors::Error) -> Self {
        match e.kind() {
            jsonwebtoken::errors::ErrorKind::ExpiredSignature => AuthError::TokenExpired,
            jsonwebtoken::errors::ErrorKind::InvalidToken => AuthError::InvalidToken,
            jsonwebtoken::errors::ErrorKind::InvalidSignature => AuthError::InvalidToken,
            _ => AuthError::Internal(e.to_string()),
        }
    }
}
