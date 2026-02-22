pub mod context;
pub mod executor;
pub mod scheduler;
pub mod worker;

pub use context::ExecutionContextManager;
pub use executor::{ExecutionEngine, FlowExecutor};
pub use scheduler::{CronScheduler, ScheduledFlow, ScheduleBuilder};
pub use worker::{WorkerPool, ExecutionTask, TaskPriority};

use crate::models::{ExecutionError, ExecutionStatus, NodeOutput};
use async_trait::async_trait;
use std::sync::Arc;

/// Trait for executing nodes
#[async_trait]
pub trait NodeExecutor: Send + Sync {
    async fn execute(
        &self,
        node: &crate::models::Node,
        context: &mut crate::models::ExecutionContext,
    ) -> Result<NodeOutput, ExecutionError>;
    
    fn node_type(&self) -> crate::models::NodeType;
}

/// Registry of node executors
pub struct ExecutorRegistry {
    executors: std::collections::HashMap<crate::models::NodeType, Arc<dyn NodeExecutor>>,
}

impl ExecutorRegistry {
    pub fn new() -> Self {
        Self {
            executors: std::collections::HashMap::new(),
        }
    }
    
    pub fn register(&mut self, executor: Arc<dyn NodeExecutor>) {
        self.executors.insert(executor.node_type(), executor);
    }
    
    pub fn get(&self, node_type: &crate::models::NodeType) -> Option<Arc<dyn NodeExecutor>> {
        self.executors.get(node_type).cloned()
    }
}

impl Default for ExecutorRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Execution options
#[derive(Debug, Clone)]
pub struct ExecutionOptions {
    pub timeout_seconds: u64,
    pub max_retries: u32,
    pub enable_caching: bool,
    pub enable_streaming: bool,
    pub parallel_branches: bool,
}

impl Default for ExecutionOptions {
    fn default() -> Self {
        Self {
            timeout_seconds: 300,
            max_retries: 3,
            enable_caching: true,
            enable_streaming: true,
            parallel_branches: true,
        }
    }
}

/// Execution result
#[derive(Debug, Clone)]
pub struct ExecutionResult {
    pub status: ExecutionStatus,
    pub output: Option<serde_json::Value>,
    pub error: Option<String>,
    pub duration_ms: i64,
    pub logs_count: usize,
}
