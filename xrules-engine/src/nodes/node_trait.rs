use async_trait::async_trait;

use crate::models::{ExecutionContext, ExecutionError, Node, NodeOutput, NodeType};

/// Configuration for a node executor
pub trait NodeConfig: Send + Sync {
    /// Validate the node configuration
    fn validate(&self, node: &Node) -> Result<(), Vec<String>>;
    
    /// Get required fields
    fn required_fields(&self) -> Vec<&'static str>;
    
    /// Get optional fields with defaults
    fn optional_fields(&self) -> Vec<(&'static str, serde_json::Value)>;
}

/// Result of node execution
#[derive(Debug, Clone)]
pub struct NodeResult {
    pub output: serde_json::Value,
    pub next_nodes: Vec<String>,
    pub logs: Vec<String>,
}

impl NodeResult {
    pub fn new(output: serde_json::Value) -> Self {
        Self {
            output,
            next_nodes: Vec::new(),
            logs: Vec::new(),
        }
    }
    
    pub fn with_next_nodes(mut self, nodes: Vec<String>) -> Self {
        self.next_nodes = nodes;
        self
    }
    
    pub fn with_logs(mut self, logs: Vec<String>) -> Self {
        self.logs = logs;
        self
    }
    
    pub fn into_output(self) -> NodeOutput {
        NodeOutput {
            data: self.output,
            next_nodes: self.next_nodes,
        }
    }
}

/// Trait for node executors
#[async_trait]
pub trait NodeExecutor: Send + Sync {
    /// Execute the node
    async fn execute(
        &self,
        node: &Node,
        context: &mut ExecutionContext,
    ) -> Result<NodeOutput, ExecutionError>;
    
    /// Get the node type this executor handles
    fn node_type(&self) -> NodeType;
    
    /// Get the node configuration validator (optional)
    fn config(&self) -> Option<&dyn NodeConfig> {
        None
    }
    
    /// Validate the node before execution
    fn validate(&self, node: &Node) -> Result<(), ExecutionError> {
        if let Some(config) = self.config() {
            if let Err(errors) = config.validate(node) {
                return Err(ExecutionError::validation_error(
                    errors.join("; ")
                ));
            }
        }
        Ok(())
    }
}

/// Base executor with common functionality
#[async_trait]
pub trait BaseExecutor: Send + Sync {
    async fn pre_execute(&self, _node: &Node, _context: &mut ExecutionContext) -> Result<(), ExecutionError> {
        Ok(())
    }
    
    async fn post_execute(
        &self,
        node: &Node,
        context: &mut ExecutionContext,
        result: &NodeOutput,
    ) -> Result<(), ExecutionError> {
        // Log execution result
        context.log_debug(&node.id, format!("Node executed: {}", node.node_type));
        Ok(())
    }
    
    async fn on_error(
        &self,
        node: &Node,
        context: &mut ExecutionContext,
        error: &ExecutionError,
    ) -> Result<(), ExecutionError> {
        context.log_error(&node.id, format!("Node execution error: {}", error));
        Ok(())
    }
}

/// Macro for implementing simple node executors
#[macro_export]
macro_rules! impl_node_executor {
    ($type:ty, $node_type:expr) => {
        #[async_trait::async_trait]
        impl crate::engine::NodeExecutor for $type {
            async fn execute(
                &self,
                node: &crate::models::Node,
                context: &mut crate::models::ExecutionContext,
            ) -> Result<crate::models::NodeOutput, crate::models::ExecutionError> {
                self.execute_internal(node, context).await
            }
            
            fn node_type(&self) -> crate::models::NodeType {
                $node_type
            }
        }
    };
}
