use crate::auth::claims::{Claims, Role};
use crate::auth::errors::AuthError;
use crate::auth::middleware::AuthConfig;
use jsonwebtoken::{encode, EncodingKey, Header};
use std::collections::HashSet;
use std::sync::{Arc, RwLock};

/// Authentication service
pub struct AuthService {
    config: Arc<AuthConfig>,
    /// Revoked tokens (in production, use Redis)
    revoked_tokens: RwLock<HashSet<String>>,
}

impl AuthService {
    pub fn new(config: Arc<AuthConfig>) -> Self {
        Self {
            config,
            revoked_tokens: RwLock::new(HashSet::new()),
        }
    }

    /// Authenticate user and generate tokens
    pub async fn authenticate(
        &self,
        username: &str,
        password: &str,
    ) -> Result<(String, String, Claims), AuthError> {
        // TODO: In production, verify against database
        // For now, use a simple mock authentication
        let user = self.verify_credentials(username, password).await?;

        // Generate access token
        let access_claims = Claims::new(
            &user.id,
            &user.username,
            &user.email,
            user.roles.clone(),
            self.config.access_token_expiry_hours,
        );

        let access_token = encode(
            &Header::default(),
            &access_claims,
            &EncodingKey::from_secret(self.config.secret.as_bytes()),
        )
        .map_err(|e| AuthError::Internal(e.to_string()))?;

        // Generate refresh token
        let refresh_claims = Claims::new_refresh(&user.id, &user.username, &user.email, user.roles);

        let refresh_token = encode(
            &Header::default(),
            &refresh_claims,
            &EncodingKey::from_secret(self.config.refresh_secret.as_bytes()),
        )
        .map_err(|e| AuthError::Internal(e.to_string()))?;

        Ok((access_token, refresh_token, access_claims))
    }

    /// Refresh access token using refresh token
    pub async fn refresh(
        &self,
        refresh_token: &str,
    ) -> Result<(String, String, Claims), AuthError> {
        // Validate refresh token
        let validation = jsonwebtoken::Validation::default();
        let decoding_key =
            jsonwebtoken::DecodingKey::from_secret(self.config.refresh_secret.as_bytes());

        let token_data = jsonwebtoken::decode::<Claims>(refresh_token, &decoding_key, &validation)
            .map_err(|e| match e.kind() {
                jsonwebtoken::errors::ErrorKind::ExpiredSignature => AuthError::TokenExpired,
                _ => AuthError::InvalidToken,
            })?;

        let claims = token_data.claims;

        // Check if token is revoked
        if self.is_revoked(refresh_token) {
            return Err(AuthError::TokenRevoked);
        }

        // Generate new tokens
        let new_access_claims = Claims::new(
            &claims.sub,
            &claims.username,
            &claims.email,
            claims.roles.clone(),
            self.config.access_token_expiry_hours,
        );

        let new_access_token = encode(
            &Header::default(),
            &new_access_claims,
            &EncodingKey::from_secret(self.config.secret.as_bytes()),
        )
        .map_err(|e| AuthError::Internal(e.to_string()))?;

        let new_refresh_claims =
            Claims::new_refresh(&claims.sub, &claims.username, &claims.email, claims.roles);

        let new_refresh_token = encode(
            &Header::default(),
            &new_refresh_claims,
            &EncodingKey::from_secret(self.config.refresh_secret.as_bytes()),
        )
        .map_err(|e| AuthError::Internal(e.to_string()))?;

        // Revoke old refresh token
        self.revoke(refresh_token).await?;

        Ok((new_access_token, new_refresh_token, new_access_claims))
    }

    /// Revoke a token
    pub async fn revoke(&self, token: &str) -> Result<(), AuthError> {
        let mut revoked = self
            .revoked_tokens
            .write()
            .map_err(|_| AuthError::Internal("Lock poisoned".to_string()))?;
        revoked.insert(token.to_string());
        Ok(())
    }

    /// Check if token is revoked
    pub fn is_revoked(&self, token: &str) -> bool {
        self.revoked_tokens
            .read()
            .map(|revoked| revoked.contains(token))
            .unwrap_or(false)
    }

    /// Get access token expiry in seconds
    pub fn access_token_expiry(&self) -> i64 {
        self.config.access_token_expiry_hours * 3600
    }

    /// Verify user credentials (mock implementation)
    async fn verify_credentials(&self, username: &str, password: &str) -> Result<User, AuthError> {
        // TODO: In production, verify against database with bcrypt
        // Mock users for demonstration
        let mock_users = vec![
            (
                "admin",
                "admin123", // In production, this would be a bcrypt hash
                "550e8400-e29b-41d4-a716-446655440000",
                "admin@xrules.io",
                vec![Role::Admin, Role::Editor, Role::Viewer],
            ),
            (
                "editor",
                "editor123",
                "550e8400-e29b-41d4-a716-446655440001",
                "editor@xrules.io",
                vec![Role::Editor, Role::Viewer],
            ),
            (
                "viewer",
                "viewer123",
                "550e8400-e29b-41d4-a716-446655440002",
                "viewer@xrules.io",
                vec![Role::Viewer],
            ),
        ];

        for (u, p, id, email, roles) in mock_users {
            if u == username && p == password {
                return Ok(User {
                    id: id.to_string(),
                    username: u.to_string(),
                    email: email.to_string(),
                    roles,
                });
            }
        }

        Err(AuthError::InvalidCredentials)
    }
}

/// User information
struct User {
    id: String,
    username: String,
    email: String,
    roles: Vec<Role>,
}
