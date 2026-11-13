//! Integration tests
//!
//! Tests that verify components work together, may require external services

pub mod api_tests;
pub mod auth_integration_tests;
pub mod grpc_tests;
pub mod hub_integration_tests;

use std::sync::Once;

static INIT: Once = Once::new();

pub fn setup() {
    INIT.call_once(|| {
        let _ = tracing_subscriber::fmt().with_env_filter("info").try_init();
    });
}

/// Helper function to check if gRPC tests should be skipped
pub fn should_skip_grpc_tests() -> bool {
    std::env::var("SKIP_GRPC_TESTS").is_ok()
}

/// Helper function to get the test server URL
pub fn test_server_url() -> String {
    std::env::var("TEST_SERVER_URL").unwrap_or_else(|_| "http://127.0.0.1:50051".to_string())
}

/// Helper function to get the gRPC server URL
pub fn grpc_server_url() -> String {
    std::env::var("GRPC_SERVER_URL").unwrap_or_else(|_| "http://127.0.0.1:50060".to_string())
}
