use async_trait::async_trait;

use crate::engine::NodeExecutor;
use crate::models::{ExecutionContext, ExecutionError, Node, NodeOutput, NodeType};

/// Executor for delay nodes (pause execution)
pub struct DelayExecutor;

impl DelayExecutor {
    pub fn new() -> Self {
        Self
    }
    
    async fn execute_internal(
        &self,
        node: &Node,
        context: &mut ExecutionContext,
    ) -> Result<NodeOutput, ExecutionError> {
        // Get delay duration
        let delay_ms = node.data
            .get("duration")
            .and_then(|v| v.as_u64())
            .or_else(|| node.data.get("milliseconds").and_then(|v| v.as_u64()))
            .or_else(|| {
                node.data.get("seconds")
                    .and_then(|v| v.as_u64())
                    .map(|s| s * 1000)
            })
            .unwrap_or(1000); // Default 1 second
        
        context.log_info(&node.id, format!("Delaying for {}ms", delay_ms));
        
        // Check for cancellation before sleeping
        if context.is_cancelled() {
            return Err(ExecutionError::cancelled_error("Execution cancelled during delay"));
        }
        
        // Sleep for the specified duration
        tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
        
        // Check for cancellation after sleeping
        if context.is_cancelled() {
            return Err(ExecutionError::cancelled_error("Execution cancelled after delay"));
        }
        
        context.log_info(&node.id, "Delay completed");
        
        // Pass through the input data
        let input = context.get_variable("input")
            .cloned()
            .unwrap_or(serde_json::json!({}));
        
        // Store delay info
        context.set_variable(format!("{}_delay_ms", node.id), serde_json::json!(delay_ms));
        
        Ok(NodeOutput::new(input))
    }
}

#[async_trait]
impl NodeExecutor for DelayExecutor {
    async fn execute(
        &self,
        node: &Node,
        context: &mut ExecutionContext,
    ) -> Result<NodeOutput, ExecutionError> {
        self.execute_internal(node, context).await
    }
    
    fn node_type(&self) -> NodeType {
        NodeType::Delay
    }
}

impl Default for DelayExecutor {
    fn default() -> Self {
        Self::new()
    }
}
