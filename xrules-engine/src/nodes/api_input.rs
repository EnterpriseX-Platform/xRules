use async_trait::async_trait;

use crate::engine::NodeExecutor;
use crate::models::{ExecutionContext, ExecutionError, Node, NodeOutput, NodeType};

/// Executor for API input nodes (entry points)
pub struct ApiInputExecutor;

impl ApiInputExecutor {
    pub fn new() -> Self {
        Self
    }
    
    async fn execute_internal(
        &self,
        node: &Node,
        context: &mut ExecutionContext,
    ) -> Result<NodeOutput, ExecutionError> {
        context.log_info(&node.id, "API Input node - processing request");
        
        // API input node passes through the input data
        // In a real implementation, this might validate the input schema
        let input = context.get_variable("input")
            .cloned()
            .unwrap_or(serde_json::json!({}));
        
        // Extract any parameters defined in the node
        if let Some(params) = node.data.get("params") {
            if let Some(required) = params.get("required").and_then(|v| v.as_array()) {
                for param in required {
                    if let Some(param_name) = param.as_str() {
                        if !input.get(param_name).is_some() {
                            return Err(ExecutionError::validation_error(
                                format!("Missing required parameter: {}", param_name)
                            ));
                        }
                    }
                }
            }
        }
        
        // Set default response structure if configured
        if let Some(defaults) = node.data.get("defaults") {
            let mut merged = defaults.clone();
            if let serde_json::Value::Object(ref mut map) = merged {
                if let serde_json::Value::Object(input_map) = input {
                    for (key, value) in input_map {
                        map.insert(key, value);
                    }
                }
            }
            context.set_variable("input", merged.clone());
            Ok(NodeOutput::new(merged))
        } else {
            Ok(NodeOutput::new(input))
        }
    }
}

#[async_trait]
impl NodeExecutor for ApiInputExecutor {
    async fn execute(
        &self,
        node: &Node,
        context: &mut ExecutionContext,
    ) -> Result<NodeOutput, ExecutionError> {
        self.execute_internal(node, context).await
    }
    
    fn node_type(&self) -> NodeType {
        NodeType::ApiInput
    }
}

impl Default for ApiInputExecutor {
    fn default() -> Self {
        Self::new()
    }
}
