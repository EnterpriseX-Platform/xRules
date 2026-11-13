//! Test suite for XRules Engine
//! 
//! Run tests with: cargo test
//! Run specific test: cargo test test_name
//! Run with output: cargo test -- --nocapture

pub mod unit;
pub mod integration;
pub mod e2e;

// Test utilities
pub mod common {
    use std::sync::Once;
    
    static INIT: Once = Once::new();
    
    /// Initialize test environment
    pub fn setup() {
        INIT.call_once(|| {
            // Initialize tracing for tests
            let _ = tracing_subscriber::fmt()
                .with_env_filter("debug")
                .try_init();
        });
    }
    
    /// Generate a test JWT token
    pub fn generate_test_token(user_id: &str, roles: Vec<&str>) -> String {
        use jsonwebtoken::{encode, Header, Algorithm};
        use serde::{Deserialize, Serialize};
        
        #[derive(Debug, Serialize, Deserialize)]
        struct TestClaims {
            sub: String,
            roles: Vec<String>,
            exp: i64,
        }
        
        let claims = TestClaims {
            sub: user_id.to_string(),
            roles: roles.into_iter().map(|r| r.to_string()).collect(),
            exp: chrono::Utc::now().timestamp() + 3600,
        };
        
        let secret = "test-secret";
        encode(
            &Header::new(Algorithm::HS256),
            &claims,
            &jsonwebtoken::EncodingKey::from_secret(secret.as_bytes())
        ).unwrap()
    }
    
    /// Create test database URL (SQLite for tests)
    pub fn test_database_url() -> String {
        "sqlite::memory:".to_string()
    }
}

#[cfg(test)]
mod test_main {
    use super::common;
    
    #[test]
    fn test_setup() {
        common::setup();
        // Just verify setup doesn't panic
    }
    
    #[test]
    fn test_generate_token() {
        let token = common::generate_test_token("user-123", vec!["Admin", "Editor"]);
        assert!(!token.is_empty());
        assert!(token.contains('.')); // JWT format: header.payload.signature
    }
}
