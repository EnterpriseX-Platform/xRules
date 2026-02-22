pub mod aggregate_join;
pub mod aggregate_split;
pub mod api_input;
pub mod api_output;
pub mod condition;
pub mod database;
pub mod delay;
pub mod http_request;
pub mod node_trait;
pub mod sftp;
pub mod transform;

pub use aggregate_join::AggregateJoinExecutor;
pub use aggregate_split::AggregateSplitExecutor;
pub use api_input::ApiInputExecutor;
pub use api_output::ApiOutputExecutor;
pub use condition::ConditionExecutor;
pub use database::DatabaseExecutor;
pub use delay::DelayExecutor;
pub use http_request::HttpExecutor;
pub use node_trait::{NodeConfig, NodeExecutor, NodeResult};
pub use sftp::SftpExecutor;
pub use transform::TransformExecutor;

use crate::models::{ExecutionContext, ExecutionError, Node, NodeOutput, NodeType};
use async_trait::async_trait;
use std::sync::Arc;

/// Registry of node executors
pub struct NodeRegistry {
    executors: std::collections::HashMap<NodeType, Arc<dyn NodeExecutor>>,
}

impl NodeRegistry {
    pub fn new() -> Self {
        Self {
            executors: std::collections::HashMap::new(),
        }
    }
    
    pub fn register(&mut self, node_type: NodeType, executor: Arc<dyn NodeExecutor>) {
        self.executors.insert(node_type, executor);
    }
    
    pub fn get(&self, node_type: &NodeType) -> Option<Arc<dyn NodeExecutor>> {
        self.executors.get(node_type).cloned()
    }
    
    pub fn unregister(&mut self, node_type: &NodeType) -> Option<Arc<dyn NodeExecutor>> {
        self.executors.remove(node_type)
    }
    
    pub fn has(&self, node_type: &NodeType) -> bool {
        self.executors.contains_key(node_type)
    }
    
    pub fn types(&self) -> Vec<NodeType> {
        self.executors.keys().cloned().collect()
    }
    
    /// Create a registry with all built-in executors
    pub fn with_defaults() -> Self {
        let mut registry = Self::new();
        
        registry.register(NodeType::ApiInput, Arc::new(ApiInputExecutor::new()));
        registry.register(NodeType::ApiOutput, Arc::new(ApiOutputExecutor::new()));
        registry.register(NodeType::Condition, Arc::new(ConditionExecutor::new()));
        registry.register(NodeType::Transform, Arc::new(TransformExecutor::new()));
        registry.register(NodeType::Delay, Arc::new(DelayExecutor::new()));
        registry.register(NodeType::AggregateSplit, Arc::new(AggregateSplitExecutor::new()));
        registry.register(NodeType::AggregateJoin, Arc::new(AggregateJoinExecutor::new()));
        
        registry
    }
    
    /// Create a registry with database executor
    pub fn with_database(self, db_pool: sqlx::PgPool) -> Self {
        let mut registry = self;
        registry.register(NodeType::Database, Arc::new(DatabaseExecutor::new(db_pool)));
        registry
    }
    
    /// Create a registry with HTTP executor
    pub fn with_http(self, client: reqwest::Client) -> Self {
        let mut registry = self;
        registry.register(NodeType::HttpRequest, Arc::new(HttpExecutor::new(client)));
        registry
    }
}

impl Default for NodeRegistry {
    fn default() -> Self {
        Self::with_defaults()
    }
}

/// Node execution helper functions
pub mod helpers {
    use super::*;
    
    /// Get a string parameter from node data
    pub fn get_string_param(node: &Node, key: &str) -> Result<String, ExecutionError> {
        node.data
            .get(key)
            .and_then(|v| v.as_str())
            .map(String::from)
            .ok_or_else(|| {
                ExecutionError::node_error(
                    &node.id,
                    format!("Missing or invalid parameter: {}", key),
                )
            })
    }
    
    /// Get an optional string parameter from node data
    pub fn get_optional_string_param(node: &Node, key: &str) -> Option<String> {
        node.data.get(key).and_then(|v| v.as_str()).map(String::from)
    }
    
    /// Get an integer parameter from node data
    pub fn get_int_param(node: &Node, key: &str) -> Result<i64, ExecutionError> {
        node.data
            .get(key)
            .and_then(|v| v.as_i64())
            .ok_or_else(|| {
                ExecutionError::node_error(
                    &node.id,
                    format!("Missing or invalid integer parameter: {}", key),
                )
            })
    }
    
    /// Get a boolean parameter from node data
    pub fn get_bool_param(node: &Node, key: &str) -> Result<bool, ExecutionError> {
        node.data
            .get(key)
            .and_then(|v| v.as_bool())
            .ok_or_else(|| {
                ExecutionError::node_error(
                    &node.id,
                    format!("Missing or invalid boolean parameter: {}", key),
                )
            })
    }
    
    /// Get an object parameter from node data
    pub fn get_object_param(node: &Node, key: &str) -> Result<serde_json::Value, ExecutionError> {
        node.data
            .get(key)
            .cloned()
            .ok_or_else(|| {
                ExecutionError::node_error(
                    &node.id,
                    format!("Missing parameter: {}", key),
                )
            })
    }
    
    /// Replace variables in a string with context values
    pub fn replace_variables(template: &str, context: &ExecutionContext) -> String {
        let mut result = template.to_string();
        
        // Replace {{variable}} syntax
        for (key, value) in &context.variables {
            let placeholder = format!("{{{{{}}}}}", key);
            let replacement = match value {
                serde_json::Value::String(s) => s.clone(),
                v => v.to_string(),
            };
            result = result.replace(&placeholder, &replacement);
        }
        
        // Replace ${variable} syntax
        for (key, value) in &context.variables {
            let placeholder = format!("${{{}}}", key);
            let replacement = match value {
                serde_json::Value::String(s) => s.clone(),
                v => v.to_string(),
            };
            result = result.replace(&placeholder, &replacement);
        }
        
        result
    }
}
