use async_trait::async_trait;

use crate::engine::NodeExecutor;
use crate::models::{ExecutionContext, ExecutionError, Node, NodeOutput, NodeType};

/// Executor for aggregate split nodes (fan-out to parallel branches)
pub struct AggregateSplitExecutor;

impl AggregateSplitExecutor {
    pub fn new() -> Self {
        Self
    }
    
    async fn execute_internal(
        &self,
        node: &Node,
        context: &mut ExecutionContext,
    ) -> Result<NodeOutput, ExecutionError> {
        context.log_info(&node.id, "Aggregate Split - fanning out to parallel branches");
        
        // Get input data
        let input = context.get_variable("input")
            .cloned()
            .unwrap_or(serde_json::json!({}));
        
        // Get branch configuration
        let branches = node.data
            .get("branches")
            .and_then(|v| v.as_array())
            .map(|arr| arr.len())
            .unwrap_or(2); // Default 2 branches
        
        // Check for iterations over an array
        let iterations = if let Some(iterate_over) = node.data.get("iterateOver").and_then(|v| v.as_str()) {
            // Get the array to iterate over
            let array = if iterate_over.starts_with('$') {
                self.resolve_path(iterate_over, context)
            } else {
                context.get_variable(iterate_over).cloned().unwrap_or(serde_json::json!([]))
            };
            
            if let Some(arr) = array.as_array() {
                Some(arr.clone())
            } else {
                None
            }
        } else {
            None
        };
        
        // Store split information
        context.set_variable(format!("{}_branches", node.id), serde_json::json!(branches));
        context.set_variable(format!("{}_is_split", node.id), serde_json::json!(true));
        
        if let Some(items) = iterations {
            // Iteration mode - create output for each item
            context.log_info(&node.id, format!("Splitting into {} iterations", items.len()));
            
            context.set_variable(format!("{}_iterations", node.id), serde_json::json!(items.len()));
            
            // Store the items for iteration
            for (i, item) in items.iter().enumerate() {
                context.set_variable(format!("{}_item_{}", node.id, i), item.clone());
            }
            
            // Output includes iteration info
            let output = serde_json::json!({
                "iterations": items.len(),
                "items": items,
                "input": input,
            });
            
            Ok(NodeOutput::new(output))
        } else {
            // Standard parallel branch mode
            context.log_info(&node.id, format!("Splitting into {} parallel branches", branches));
            
            let output = serde_json::json!({
                "branches": branches,
                "input": input,
            });
            
            Ok(NodeOutput::new(output))
        }
    }
    
    fn resolve_path(&self, path: &str, context: &ExecutionContext) -> serde_json::Value {
        let path = path.trim_start_matches('$');
        let parts: Vec<&str> = path.split('.').collect();
        
        if parts.is_empty() {
            return serde_json::Value::Null;
        }
        
        let mut current = context.get_variable(parts[0])
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        
        for part in &parts[1..] {
            current = match current {
                serde_json::Value::Object(map) => {
                    map.get(*part).cloned().unwrap_or(serde_json::Value::Null)
                }
                serde_json::Value::Array(arr) => {
                    part.parse::<usize>()
                        .ok()
                        .and_then(|i| arr.get(i).cloned())
                        .unwrap_or(serde_json::Value::Null)
                }
                _ => serde_json::Value::Null,
            };
        }
        
        current
    }
}

#[async_trait]
impl NodeExecutor for AggregateSplitExecutor {
    async fn execute(
        &self,
        node: &Node,
        context: &mut ExecutionContext,
    ) -> Result<NodeOutput, ExecutionError> {
        self.execute_internal(node, context).await
    }
    
    fn node_type(&self) -> NodeType {
        NodeType::AggregateSplit
    }
}

impl Default for AggregateSplitExecutor {
    fn default() -> Self {
        Self::new()
    }
}
