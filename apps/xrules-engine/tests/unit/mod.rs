//! Unit tests
//! 
//! Fast, isolated tests with no external dependencies

pub mod auth_tests;
pub mod hub_tests;
pub mod engine_tests;
pub mod decision_table_tests;

use std::sync::Once;

static INIT: Once = Once::new();

pub fn setup() {
    INIT.call_once(|| {
        let _ = tracing_subscriber::fmt()
            .with_env_filter("debug")
            .try_init();
    });
}
