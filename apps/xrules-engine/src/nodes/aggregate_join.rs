use async_trait::async_trait;
use serde_json::json;

use crate::engine::NodeExecutor;
use crate::models::{ExecutionContext, ExecutionError, Node, NodeOutput, NodeType};

/// Executor for aggregate join nodes (fan-in from parallel branches)
pub struct AggregateJoinExecutor;

impl AggregateJoinExecutor {
    pub fn new() -> Self {
        Self
    }
    
    async fn execute_internal(
        &self,
        node: &Node,
        context: &mut ExecutionContext,
    ) -> Result<NodeOutput, ExecutionError> {
        context.log_info(&node.id, "Aggregate Join - aggregating branch results");
        
        // Get the input (from one of the branches)
        let input = context.get_variable("input")
            .cloned()
            .unwrap_or(serde_json::json!({}));
        
        // Get aggregation mode
        let mode = node.data
            .get("mode")
            .and_then(|v| v.as_str())
            .unwrap_or("array"); // array, merge, first, last, sum, avg
        
        // The actual aggregation logic is handled by the execution engine
        // This executor just prepares the join and passes through the input
        // The engine will collect results from all branches and call this node again
        
        context.set_variable(format!("{}_mode", node.id), json!(mode));
        context.set_variable(format!("{}_is_join", node.id), json!(true));
        
        // Check if this is a collected aggregation (from multiple branches)
        if let Some(branches) = input.get("branches").and_then(|v| v.as_array()) {
            // This is the aggregated result
            let result = self.aggregate_results(mode, branches)?;
            
            context.log_info(&node.id, format!("Aggregated {} branches using {} mode", branches.len(), mode));
            
            Ok(NodeOutput::new(result))
        } else {
            // Single branch result, pass through
            Ok(NodeOutput::new(input))
        }
    }
    
    fn aggregate_results(
        &self,
        mode: &str,
        branches: &[serde_json::Value],
    ) -> Result<serde_json::Value, ExecutionError> {
        match mode {
            "array" => {
                // Return all results as an array
                Ok(json!({ "results": branches }))
            }
            "merge" => {
                // Merge all objects into one
                let mut merged = serde_json::Map::new();
                for branch in branches {
                    if let Some(obj) = branch.as_object() {
                        for (key, value) in obj {
                            merged.insert(key.clone(), value.clone());
                        }
                    }
                }
                Ok(serde_json::Value::Object(merged))
            }
            "first" => {
                // Return first non-null result
                Ok(branches.first().cloned().unwrap_or(serde_json::Value::Null))
            }
            "last" => {
                // Return last non-null result
                Ok(branches.last().cloned().unwrap_or(serde_json::Value::Null))
            }
            "sum" => {
                // Sum numeric values
                let mut total = 0.0;
                for branch in branches {
                    if let Some(num) = branch.as_f64() {
                        total += num;
                    } else if let Some(num) = branch.as_i64() {
                        total += num as f64;
                    }
                }
                Ok(json!(total))
            }
            "avg" => {
                // Average of numeric values
                let mut total = 0.0;
                let mut count = 0;
                for branch in branches {
                    if let Some(num) = branch.as_f64() {
                        total += num;
                        count += 1;
                    } else if let Some(num) = branch.as_i64() {
                        total += num as f64;
                        count += 1;
                    }
                }
                if count > 0 {
                    Ok(json!(total / count as f64))
                } else {
                    Ok(json!(null))
                }
            }
            "max" => {
                // Maximum value
                let mut max: Option<f64> = None;
                for branch in branches {
                    let val = branch.as_f64()
                        .or_else(|| branch.as_i64().map(|v| v as f64));
                    if let Some(num) = val {
                        max = Some(max.map(|m| m.max(num)).unwrap_or(num));
                    }
                }
                Ok(json!(max))
            }
            "min" => {
                // Minimum value
                let mut min: Option<f64> = None;
                for branch in branches {
                    let val = branch.as_f64()
                        .or_else(|| branch.as_i64().map(|v| v as f64));
                    if let Some(num) = val {
                        min = Some(min.map(|m| m.min(num)).unwrap_or(num));
                    }
                }
                Ok(json!(min))
            }
            "count" => {
                // Count of results
                Ok(json!(branches.len()))
            }
            _ => {
                // Unknown mode, default to array
                Ok(json!({ "results": branches, "mode": mode }))
            }
        }
    }
}

#[async_trait]
impl NodeExecutor for AggregateJoinExecutor {
    async fn execute(
        &self,
        node: &Node,
        context: &mut ExecutionContext,
    ) -> Result<NodeOutput, ExecutionError> {
        self.execute_internal(node, context).await
    }
    
    fn node_type(&self) -> NodeType {
        NodeType::AggregateJoin
    }
}

impl Default for AggregateJoinExecutor {
    fn default() -> Self {
        Self::new()
    }
}
