use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fmt;

/// JWT Claims structure
/// Supports tokens from Studio Backend (unified format)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    /// Subject (user ID) - Studio Backend sends as "sub"
    #[serde(alias = "userId")]
    pub sub: String,

    /// Username
    #[serde(default)]
    pub username: String,

    /// Email
    #[serde(default)]
    pub email: String,

    /// Tenant ID (workspace slug) - from Studio Backend
    #[serde(default, alias = "tenantId")]
    pub tenant_id: Option<String>,

    /// User roles - Studio Backend sends workspace roles
    #[serde(default)]
    pub roles: Vec<Role>,

    /// Issued at
    #[serde(default)]
    pub iat: i64,

    /// Expiration time
    pub exp: i64,

    /// Not before
    #[serde(default)]
    pub nbf: i64,

    /// Issuer
    #[serde(default)]
    pub iss: String,

    /// Audience
    #[serde(default)]
    pub aud: String,

    /// JWT ID (unique token identifier)
    #[serde(default)]
    pub jti: String,
}

impl Claims {
    /// Create new claims for a user
    pub fn new(
        user_id: &str,
        username: &str,
        email: &str,
        roles: Vec<Role>,
        expiry_hours: i64,
    ) -> Self {
        let now = Utc::now();
        let exp = now + chrono::Duration::hours(expiry_hours);

        Self {
            sub: user_id.to_string(),
            username: username.to_string(),
            email: email.to_string(),
            tenant_id: None,
            roles,
            iat: now.timestamp(),
            exp: exp.timestamp(),
            nbf: now.timestamp(),
            iss: "xrules-engine".to_string(),
            aud: "xrules-api".to_string(),
            jti: uuid::Uuid::new_v4().to_string(),
        }
    }
    
    /// Create refresh token claims with longer expiry
    pub fn new_refresh(user_id: &str, username: &str, email: &str, roles: Vec<Role>) -> Self {
        // Refresh tokens valid for 7 days
        Self::new(user_id, username, email, roles, 24 * 7)
    }
    
    /// Check if token is expired
    pub fn is_expired(&self) -> bool {
        let now = Utc::now().timestamp();
        self.exp < now
    }
    
    /// Check if user has a specific role
    pub fn has_role(&self, role: Role) -> bool {
        self.roles.contains(&role)
    }
    
    /// Check if user has any of the required roles
    pub fn has_any_role(&self, roles: &[Role]) -> bool {
        roles.iter().any(|r| self.roles.contains(r))
    }
}

/// User roles
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Role {
    /// Full access to all resources
    Admin,
    
    /// Can create and modify rules
    Editor,
    
    /// Can view and execute rules
    Viewer,
    
    /// Service account for automated access
    Service,
}

impl fmt::Display for Role {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Role::Admin => write!(f, "Admin"),
            Role::Editor => write!(f, "Editor"),
            Role::Viewer => write!(f, "Viewer"),
            Role::Service => write!(f, "Service"),
        }
    }
}

impl std::str::FromStr for Role {
    type Err = String;
    
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_uppercase().as_str() {
            "ADMIN" => Ok(Role::Admin),
            "EDITOR" => Ok(Role::Editor),
            "VIEWER" => Ok(Role::Viewer),
            "SERVICE" => Ok(Role::Service),
            _ => Err(format!("Unknown role: {}", s)),
        }
    }
}

/// Token metadata
#[derive(Debug, Clone)]
pub struct TokenMetadata {
    pub claims: Claims,
    pub raw_token: String,
}
