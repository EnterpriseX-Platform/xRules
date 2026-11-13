//! End-to-End Tests
//!
//! Tests complete workflows through the entire system

pub mod workflow_tests;

use std::sync::Once;

static INIT: Once = Once::new();

pub fn setup() {
    INIT.call_once(|| {
        let _ = tracing_subscriber::fmt().with_env_filter("info").try_init();
    });
}
