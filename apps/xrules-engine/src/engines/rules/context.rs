use serde_json::Value;
use std::collections::HashMap;
use chrono::Utc;

#[derive(Debug, Clone)]
pub struct ExecutionContext {
    pub input: Value,
    pub variables: HashMap<String, Value>,
    pub start_time: chrono::DateTime<chrono::Utc>,
}

impl ExecutionContext {
    pub fn new(input: Value) -> Self {
        Self {
            input,
            variables: HashMap::new(),
            start_time: Utc::now(),
        }
    }
    
    pub fn set_variable(&mut self, key: &str, value: Value) {
        self.variables.insert(key.to_string(), value);
    }
    
    pub fn get_variable(&self, key: &str) -> Option<&Value> {
        self.variables.get(key)
    }
    
    pub fn duration_ms(&self) -> i64 {
        Utc::now().signed_duration_since(self.start_time).num_milliseconds()
    }
}
