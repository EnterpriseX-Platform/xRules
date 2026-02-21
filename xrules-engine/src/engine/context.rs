use crate::models::ExecutionContext;
use dashmap::DashMap;
use std::sync::Arc;
use uuid::Uuid;

/// Manages execution contexts for active executions
pub struct ExecutionContextManager {
    contexts: Arc<DashMap<Uuid, ExecutionContext>>,
}

impl ExecutionContextManager {
    pub fn new() -> Self {
        Self {
            contexts: Arc::new(DashMap::new()),
        }
    }
    
    /// Create a new execution context
    pub fn create_context(
        &self,
        flow_id: Uuid,
        project_id: Uuid,
        workspace_id: Option<Uuid>,
    ) -> ExecutionContext {
        let execution_id = Uuid::new_v4();
        let context = ExecutionContext::new(execution_id, flow_id, project_id, workspace_id);
        self.contexts.insert(execution_id, context.clone());
        context
    }
    
    /// Get an existing context
    pub fn get_context(&self, execution_id: Uuid) -> Option<ExecutionContext> {
        self.contexts.get(&execution_id).map(|c| c.clone())
    }
    
    /// Update a context
    pub fn update_context(&self, execution_id: Uuid, context: ExecutionContext) {
        self.contexts.insert(execution_id, context);
    }
    
    /// Remove a context
    pub fn remove_context(&self, execution_id: Uuid) -> Option<ExecutionContext> {
        self.contexts.remove(&execution_id).map(|(_, c)| c)
    }
    
    /// Check if a context exists
    pub fn has_context(&self, execution_id: Uuid) -> bool {
        self.contexts.contains_key(&execution_id)
    }
    
    /// Mark context as cancelled
    pub fn cancel_context(&self, execution_id: Uuid) -> bool {
        if let Some(mut context) = self.contexts.get_mut(&execution_id) {
            context.cancel();
            true
        } else {
            false
        }
    }
    
    /// Get all active execution IDs
    pub fn active_executions(&self) -> Vec<Uuid> {
        self.contexts.iter().map(|e| *e.key()).collect()
    }
    
    /// Get execution count
    pub fn execution_count(&self) -> usize {
        self.contexts.len()
    }
    
    /// Clear all contexts
    pub fn clear(&self) {
        self.contexts.clear();
    }
}

impl Default for ExecutionContextManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Context variables helper
pub struct ContextVariables {
    prefix: String,
}

impl ContextVariables {
    pub fn new(prefix: impl Into<String>) -> Self {
        Self {
            prefix: prefix.into(),
        }
    }
    
    pub fn get(&self, context: &ExecutionContext, key: impl AsRef<str>) -> Option<serde_json::Value> {
        let full_key = format!("{}.{}", self.prefix, key.as_ref());
        context.get_variable(&full_key).cloned()
    }
    
    pub fn set(
        &self,
        context: &mut ExecutionContext,
        key: impl AsRef<str>,
        value: impl Into<serde_json::Value>,
    ) {
        let full_key = format!("{}.{}", self.prefix, key.as_ref());
        context.set_variable(full_key, value);
    }
}

/// Helper functions for context manipulation
pub mod helpers {
    use super::*;
    use serde_json::Value;
    
    /// Resolve a variable reference from the context
    pub fn resolve_reference(context: &ExecutionContext, reference: &str) -> Option<Value> {
        // Handle simple variable names
        if let Some(value) = context.get_variable(reference) {
            return Some(value.clone());
        }
        
        // Handle dot notation (e.g., "user.name")
        if reference.contains('.') {
            let parts: Vec<&str> = reference.split('.').collect();
            let mut current = context.get_variable(parts[0])?;
            
            for part in &parts[1..] {
                current = current.get(part)?;
            }
            
            return Some(current.clone());
        }
        
        // Handle bracket notation (e.g., "items[0]")
        if reference.contains('[') && reference.contains(']') {
            // Simple implementation - could be expanded
            let base = reference.split('[').next()?;
            if let Some(array) = context.get_variable(base) {
                if let Some(index_str) = reference.split('[').nth(1) {
                    let index_str = index_str.trim_end_matches(']');
                    if let Ok(index) = index_str.parse::<usize>() {
                        return array.get(index).cloned();
                    }
                }
            }
        }
        
        None
    }
    
    /// Merge two JSON values, with b taking precedence
    pub fn merge_json(a: &mut Value, b: Value) {
        match (a, b) {
            (Value::Object(a), Value::Object(b)) => {
                for (k, v) in b {
                    merge_json(a.entry(k).or_insert(Value::Null), v);
                }
            }
            (a, b) => *a = b,
        }
    }
    
    /// Flatten a nested JSON object into dot-notation keys
    pub fn flatten_json(value: &Value, prefix: &str) -> std::collections::HashMap<String, Value> {
        let mut result = std::collections::HashMap::new();
        
        match value {
            Value::Object(map) => {
                for (key, val) in map {
                    let new_key = if prefix.is_empty() {
                        key.clone()
                    } else {
                        format!("{}.{}", prefix, key)
                    };
                    result.extend(flatten_json(val, &new_key));
                }
            }
            Value::Array(arr) => {
                for (i, val) in arr.iter().enumerate() {
                    let new_key = format!("{}[{}]", prefix, i);
                    result.extend(flatten_json(val, &new_key));
                }
            }
            _ => {
                result.insert(prefix.to_string(), value.clone());
            }
        }
        
        result
    }
}
