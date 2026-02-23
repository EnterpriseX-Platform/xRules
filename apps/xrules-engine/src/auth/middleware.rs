use crate::auth::claims::{Claims, Role, TokenMetadata};
use crate::auth::errors::AuthError;
use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{decode, DecodingKey, Validation};
use std::sync::Arc;

/// JWT Authentication middleware
/// 
/// Extracts and validates JWT token from Authorization header
pub async fn auth_middleware(
    State(config): State<Arc<AuthConfig>>,
    mut request: Request<Body>,
    next: Next,
) -> Result<Response, AuthError> {
    // Extract authorization header
    let auth_header = request
        .headers()
        .get("Authorization")
        .ok_or(AuthError::MissingAuthorization)?
        .to_str()
        .map_err(|_| AuthError::InvalidAuthorizationFormat)?;
    
    // Check Bearer prefix
    if !auth_header.starts_with("Bearer ") {
        return Err(AuthError::InvalidAuthorizationFormat);
    }
    
    let token = auth_header[7..].to_string();
    
    // Validate token
    let claims = validate_token(&token, &config.secret)?;
    
    // Add claims to request extensions
    request.extensions_mut().insert(claims.clone());
    request.extensions_mut().insert(TokenMetadata {
        claims: claims.clone(),
        raw_token: token,
    });
    
    Ok(next.run(request).await)
}

/// Validate JWT token and return claims
fn validate_token(token: &str, secret: &str) -> Result<Claims, AuthError> {
    let validation = Validation::default();
    let decoding_key = DecodingKey::from_secret(secret.as_bytes());
    
    let token_data = decode::<Claims>(token, &decoding_key, &validation)
        .map_err(|e| match e.kind() {
            jsonwebtoken::errors::ErrorKind::ExpiredSignature => AuthError::TokenExpired,
            _ => AuthError::InvalidToken,
        })?;
    
    Ok(token_data.claims)
}

/// Extract user ID from request extensions
pub fn extract_user_id(request: &Request<Body>) -> Option<String> {
    request
        .extensions()
        .get::<Claims>()
        .map(|c| c.sub.clone())
}

/// Check if user is admin
pub fn is_admin(request: &Request<Body>) -> bool {
    request
        .extensions()
        .get::<Claims>()
        .map(|c| c.has_role(Role::Admin))
        .unwrap_or(false)
}

/// Authentication configuration
#[derive(Debug, Clone)]
pub struct AuthConfig {
    pub secret: String,
    pub refresh_secret: String,
    pub access_token_expiry_hours: i64,
    pub refresh_token_expiry_days: i64,
}

impl AuthConfig {
    pub fn from_env() -> Self {
        Self {
            secret: std::env::var("JWT_SECRET")
                .unwrap_or_else(|_| "your-secret-key-change-in-production".to_string()),
            refresh_secret: std::env::var("JWT_REFRESH_SECRET")
                .unwrap_or_else(|_| "your-refresh-secret-key-change-in-production".to_string()),
            access_token_expiry_hours: std::env::var("JWT_ACCESS_EXPIRY_HOURS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(1),
            refresh_token_expiry_days: std::env::var("JWT_REFRESH_EXPIRY_DAYS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(7),
        }
    }
}
