use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;

use tokio::sync::{mpsc, RwLock};
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::engine::{ExecutionOptions, ExecutionResult, ExecutorRegistry, NodeExecutor};
use crate::models::{
    ExecutionContext, ExecutionError, ExecutionLog, ExecutionRecord, ExecutionStatus,
    Flow, Node, NodeOutput, NodeType,
};
use crate::stores::{ExecutionStore, LogStore};

/// Main execution engine for flows
pub struct ExecutionEngine {
    registry: ExecutorRegistry,
    execution_store: Arc<dyn ExecutionStore>,
    log_store: Arc<dyn LogStore>,
    options: ExecutionOptions,
    running_executions: Arc<RwLock<HashMap<Uuid, mpsc::Sender<ExecutionCommand>>>>,
}

#[derive(Debug)]
enum ExecutionCommand {
    Cancel,
    Status,
}

impl ExecutionEngine {
    pub fn new(
        registry: ExecutorRegistry,
        execution_store: Arc<dyn ExecutionStore>,
        log_store: Arc<dyn LogStore>,
        options: ExecutionOptions,
    ) -> Self {
        Self {
            registry,
            execution_store,
            log_store,
            options,
            running_executions: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    /// Execute a flow
    pub async fn execute(
        &self,
        flow: &Flow,
        input: Option<serde_json::Value>,
        metadata: Option<HashMap<String, String>>,
    ) -> crate::Result<ExecutionResult> {
        let execution_id = Uuid::new_v4();
        let start_time = std::time::Instant::now();
        
        info!(
            execution_id = %execution_id,
            flow_id = %flow.id,
            "Starting flow execution"
        );
        
        // Create execution record
        let mut record = ExecutionRecord::new(flow.id, flow.project_id);
        record.id = execution_id;
        record.workspace_id = flow.workspace_id;
        record.input_data = input.clone();
        record.metadata = metadata.map(|m| serde_json::to_value(m).unwrap_or_default());
        record.start();
        
        // Save execution record
        self.execution_store.save(&record).await?;
        
        // Create execution context
        let mut context = ExecutionContext::new(
            execution_id,
            flow.id,
            flow.project_id,
            flow.workspace_id,
        );
        
        // Merge input data
        if let Some(input) = input {
            context.merge_input(input);
        }
        
        // Create command channel
        let (tx, mut rx) = mpsc::channel(10);
        {
            let mut running = self.running_executions.write().await;
            running.insert(execution_id, tx);
        }
        
        // Execute flow with timeout
        let timeout = tokio::time::Duration::from_secs(self.options.timeout_seconds);
        let result = tokio::time::timeout(timeout, async {
            self.execute_flow_internal(flow, &mut context, &mut rx).await
        }).await;
        
        // Remove from running executions
        {
            let mut running = self.running_executions.write().await;
            running.remove(&execution_id);
        }
        
        // Process result
        let (status, output, error) = match result {
            Ok(Ok(output)) => {
                info!(
                    execution_id = %execution_id,
                    "Flow execution completed successfully"
                );
                (ExecutionStatus::Completed, Some(output), None)
            }
            Ok(Err(e)) => {
                error!(
                    execution_id = %execution_id,
                    error = %e,
                    "Flow execution failed"
                );
                let err_msg = e.to_string();
                (ExecutionStatus::Failed, None, Some(err_msg))
            }
            Err(_) => {
                warn!(
                    execution_id = %execution_id,
                    "Flow execution timed out"
                );
                (ExecutionStatus::Timeout, None, Some("Execution timed out".to_string()))
            }
        };
        
        // Update execution record
        record.status = status;
        if let Some(ref output) = output {
            record.output_data = Some(output.clone());
        }
        record.error_message = error.clone();
        record.variables = Some(serde_json::to_value(&context.variables).unwrap_or_default());
        
        match status {
            ExecutionStatus::Completed => record.complete(output),
            ExecutionStatus::Failed => record.fail(error.unwrap_or_default()),
            ExecutionStatus::Timeout => record.timeout(),
            _ => {}
        }
        
        // Save final record
        self.execution_store.save(&record).await?;
        
        // Save logs
        for log in &context.logs {
            let log_with_id = ExecutionLog {
                id: Some(Uuid::new_v4()),
                execution_id,
                node_id: log.node_id.clone(),
                level: log.level.clone(),
                message: log.message.clone(),
                metadata: log.metadata.clone(),
                created_at: log.created_at,
            };
            self.log_store.save(&log_with_id).await?;
        }
        
        let duration_ms = start_time.elapsed().as_millis() as i64;
        
        Ok(ExecutionResult {
            status,
            output,
            error,
            duration_ms,
            logs_count: context.logs.len(),
        })
    }
    
    async fn execute_flow_internal(
        &self,
        flow: &Flow,
        context: &mut ExecutionContext,
        command_rx: &mut mpsc::Receiver<ExecutionCommand>,
    ) -> Result<serde_json::Value, ExecutionError> {
        // Find start node
        let start_node = flow.get_start_node()
            .ok_or_else(|| ExecutionError::validation_error("Flow has no start node"))?;
        
        // Build adjacency list
        let adjacency = build_adjacency_list(&flow.edges);
        let reverse_adjacency = build_reverse_adjacency_list(&flow.edges);
        
        // Track node states for aggregation
        let mut node_states: HashMap<String, NodeState> = HashMap::new();
        let mut pending_aggregations: HashMap<String, Vec<serde_json::Value>> = HashMap::new();
        
        // Queue for BFS traversal
        let mut queue: VecDeque<(String, serde_json::Value)> = VecDeque::new();
        queue.push_back((start_node.id.clone(), serde_json::Value::Null));
        
        let mut visited = HashSet::new();
        let mut final_output = serde_json::Value::Null;
        
        while let Some((node_id, input_data)) = queue.pop_front() {
            // Check for cancellation
            if context.is_cancelled() {
                return Err(ExecutionError::cancelled_error("Execution was cancelled"));
            }
            
            // Check for commands
            if let Ok(cmd) = command_rx.try_recv() {
                match cmd {
                    ExecutionCommand::Cancel => {
                        context.cancel();
                        return Err(ExecutionError::cancelled_error("Execution was cancelled"));
                    }
                    ExecutionCommand::Status => {}
                }
            }
            
            // Get node
            let node = flow.get_node(&node_id)
                .ok_or_else(|| ExecutionError::node_error(&node_id, "Node not found in flow"))?;
            
            context.current_node_id = Some(node_id.clone());
            
            // Handle aggregation nodes
            if node.node_type == NodeType::AggregateJoin {
                let required_count = reverse_adjacency.get(&node_id)
                    .map(|v| v.len())
                    .unwrap_or(0);
                
                let branch_results = pending_aggregations.entry(node_id.clone()).or_default();
                branch_results.push(input_data);
                
                if branch_results.len() < required_count {
                    // Not all branches completed yet
                    context.log_info(&node_id, format!(
                        "AggregateJoin waiting for {} more branches",
                        required_count - branch_results.len()
                    ));
                    continue;
                }
                
                // All branches completed, merge results
                let merged = serde_json::json!({
                    "branches": branch_results.clone()
                });
                pending_aggregations.remove(&node_id);
                queue.push_back((node_id, merged));
                continue;
            }
            
            // Execute node
            debug!(
                execution_id = %context.execution_id,
                node_id = %node_id,
                node_type = %node.node_type,
                "Executing node"
            );
            
            let output = self.execute_node(node, context, input_data).await?;
            
            // Store output for API output nodes
            if node.node_type == NodeType::ApiOutput {
                final_output = output.data.clone();
            }
            
            // Handle aggregate split
            if node.node_type == NodeType::AggregateSplit {
                // Execute all branches in parallel (conceptually)
                for next_node_id in &output.next_nodes {
                    queue.push_back((next_node_id.clone(), output.data.clone()));
                }
            } else {
                // Normal flow - add next nodes to queue
                for next_node_id in &output.next_nodes {
                    if !visited.contains(next_node_id) {
                        visited.insert(next_node_id.clone());
                        queue.push_back((next_node_id.clone(), output.data.clone()));
                    }
                }
            }
        }
        
        Ok(final_output)
    }
    
    async fn execute_node(
        &self,
        node: &Node,
        context: &mut ExecutionContext,
        input_data: serde_json::Value,
    ) -> Result<NodeOutput, ExecutionError> {
        // Set input data as context variable
        if input_data != serde_json::Value::Null {
            context.set_variable("input", input_data.clone());
        }
        
        // Get executor for node type
        let executor = self.registry.get(&node.node_type)
            .ok_or_else(|| ExecutionError::node_error(
                &node.id,
                format!("No executor registered for node type: {}", node.node_type)
            ))?;
        
        // Execute with retry logic
        let mut last_error = None;
        for attempt in 0..=self.options.max_retries {
            if attempt > 0 {
                context.log_info(&node.id, format!("Retry attempt {}", attempt));
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            }
            
            match executor.execute(node, context).await {
                Ok(output) => {
                    context.log_info(&node.id, "Node executed successfully");
                    return Ok(output);
                }
                Err(e) => {
                    context.log_error(&node.id, format!("Node execution failed: {}", e));
                    last_error = Some(e);
                }
            }
        }
        
        Err(last_error.unwrap_or_else(|| {
            ExecutionError::node_error(&node.id, "Max retries exceeded")
        }))
    }
    
    /// Cancel a running execution
    pub async fn cancel_execution(&self, execution_id: Uuid) -> crate::Result<bool> {
        let running = self.running_executions.read().await;
        if let Some(tx) = running.get(&execution_id) {
            let _ = tx.send(ExecutionCommand::Cancel).await;
            Ok(true)
        } else {
            Ok(false)
        }
    }
    
    /// Validate a flow
    pub fn validate_flow(&self, flow: &Flow) -> Vec<String> {
        let errors = flow.validate();
        errors.into_iter().map(|e| e.message).collect()
    }
}

#[derive(Debug, Clone)]
enum NodeState {
    Pending,
    Running,
    Completed(serde_json::Value),
    Failed(String),
}

fn build_adjacency_list(edges: &[crate::models::Edge]) -> HashMap<String, Vec<String>> {
    let mut adj = HashMap::new();
    for edge in edges {
        adj.entry(edge.source.clone())
            .or_insert_with(Vec::new)
            .push(edge.target.clone());
    }
    adj
}

fn build_reverse_adjacency_list(edges: &[crate::models::Edge]) -> HashMap<String, Vec<String>> {
    let mut adj = HashMap::new();
    for edge in edges {
        adj.entry(edge.target.clone())
            .or_insert_with(Vec::new)
            .push(edge.source.clone());
    }
    adj
}

/// Flow executor for individual flow runs
pub struct FlowExecutor {
    engine: Arc<ExecutionEngine>,
}

impl FlowExecutor {
    pub fn new(engine: Arc<ExecutionEngine>) -> Self {
        Self { engine }
    }
    
    pub async fn execute(
        &self,
        flow: &Flow,
        input: Option<serde_json::Value>,
    ) -> crate::Result<ExecutionResult> {
        self.engine.execute(flow, input, None).await
    }
}
