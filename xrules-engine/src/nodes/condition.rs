use async_trait::async_trait;

use crate::engine::NodeExecutor;
use crate::models::{ExecutionContext, ExecutionError, Node, NodeOutput, NodeType};

/// Executor for condition nodes (if/else branching)
pub struct ConditionExecutor;

impl ConditionExecutor {
    pub fn new() -> Self {
        Self
    }
    
    async fn execute_internal(
        &self,
        node: &Node,
        context: &mut ExecutionContext,
    ) -> Result<NodeOutput, ExecutionError> {
        // Get the condition expression
        let condition = node.data
            .get("condition")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ExecutionError::node_error(
                &node.id,
                "Condition node must have a 'condition' field"
            ))?;
        
        context.log_debug(&node.id, format!("Evaluating condition: {}", condition));
        
        // Evaluate the condition
        let result = self.evaluate_condition(condition, context)?;
        
        context.log_info(&node.id, format!("Condition evaluated to: {}", result));
        
        // Get next nodes based on result
        let next_nodes = if result {
            // True branch
            node.data
                .get("trueBranch")
                .and_then(|v| v.as_str())
                .map(|s| vec![s.to_string()])
                .or_else(|| {
                    node.data.get("trueBranch")
                        .and_then(|v| v.as_array())
                        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                })
                .unwrap_or_default()
        } else {
            // False branch
            node.data
                .get("falseBranch")
                .and_then(|v| v.as_str())
                .map(|s| vec![s.to_string()])
                .or_else(|| {
                    node.data.get("falseBranch")
                        .and_then(|v| v.as_array())
                        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                })
                .unwrap_or_default()
        };
        
        // Pass through the input data
        let input = context.get_variable("input")
            .cloned()
            .unwrap_or(serde_json::json!({}));
        
        // Store condition result
        context.set_variable(format!("{}_result", node.id), serde_json::json!(result));
        
        Ok(NodeOutput::new(input).with_next_nodes(next_nodes))
    }
    
    fn evaluate_condition(
        &self,
        condition: &str,
        context: &ExecutionContext,
    ) -> Result<bool, ExecutionError> {
        // Replace variable references with actual values
        let evaluated = self.replace_variables(condition, context);
        
        // Simple expression evaluation
        self.eval_expression(&evaluated)
    }
    
    fn replace_variables(&self, expr: &str, context: &ExecutionContext) -> String {
        let mut result = expr.to_string();
        
        // Replace {{variable}} syntax
        for (key, value) in &context.variables {
            let placeholder = format!("{{{{{}}}}}", key);
            let replacement = match value {
                serde_json::Value::String(s) => format!("'{}'", s),
                serde_json::Value::Number(n) => n.to_string(),
                serde_json::Value::Bool(b) => b.to_string(),
                serde_json::Value::Null => "null".to_string(),
                _ => continue, // Skip complex values
            };
            result = result.replace(&placeholder, &replacement);
        }
        
        // Replace $variable syntax
        for (key, value) in &context.variables {
            let placeholder = format!("${{{}}}", key);
            let replacement = match value {
                serde_json::Value::String(s) => format!("'{}'", s),
                serde_json::Value::Number(n) => n.to_string(),
                serde_json::Value::Bool(b) => b.to_string(),
                serde_json::Value::Null => "null".to_string(),
                _ => continue,
            };
            result = result.replace(&placeholder, &replacement);
        }
        
        result
    }
    
    fn eval_expression(&self, expr: &str) -> Result<bool, ExecutionError> {
        let expr = expr.trim();
        
        // Handle comparison operators
        if expr.contains("==") {
            let parts: Vec<&str> = expr.split("==").collect();
            if parts.len() == 2 {
                let left = parts[0].trim();
                let right = parts[1].trim();
                return Ok(left == right);
            }
        }
        
        if expr.contains("!=") {
            let parts: Vec<&str> = expr.split("!=").collect();
            if parts.len() == 2 {
                let left = parts[0].trim();
                let right = parts[1].trim();
                return Ok(left != right);
            }
        }
        
        if expr.contains(">=") {
            let parts: Vec<&str> = expr.split(">=").collect();
            if parts.len() == 2 {
                let left = self.parse_number(parts[0].trim())?;
                let right = self.parse_number(parts[1].trim())?;
                return Ok(left >= right);
            }
        }
        
        if expr.contains("<=") {
            let parts: Vec<&str> = expr.split("<=").collect();
            if parts.len() == 2 {
                let left = self.parse_number(parts[0].trim())?;
                let right = self.parse_number(parts[1].trim())?;
                return Ok(left <= right);
            }
        }
        
        if expr.contains('>') {
            let parts: Vec<&str> = expr.split('>').collect();
            if parts.len() == 2 {
                let left = self.parse_number(parts[0].trim())?;
                let right = self.parse_number(parts[1].trim())?;
                return Ok(left > right);
            }
        }
        
        if expr.contains('<') {
            let parts: Vec<&str> = expr.split('<').collect();
            if parts.len() == 2 {
                let left = self.parse_number(parts[0].trim())?;
                let right = self.parse_number(parts[1].trim())?;
                return Ok(left < right);
            }
        }
        
        // Handle logical operators
        if expr.contains(" && ") {
            let parts: Vec<&str> = expr.split(" && ").collect();
            for part in parts {
                if !self.eval_expression(part.trim())? {
                    return Ok(false);
                }
            }
            return Ok(true);
        }
        
        if expr.contains(" || ") {
            let parts: Vec<&str> = expr.split(" || ").collect();
            for part in parts {
                if self.eval_expression(part.trim())? {
                    return Ok(true);
                }
            }
            return Ok(false);
        }
        
        // Handle negation
        if expr.starts_with('!') {
            let inner = &expr[1..].trim();
            return Ok(!self.eval_expression(inner)?);
        }
        
        // Handle boolean literals
        match expr {
            "true" => Ok(true),
            "false" => Ok(false),
            "null" => Ok(false),
            s if s.starts_with('"') || s.starts_with('\'') => Ok(!s.is_empty() && s != "''" && s != "\"\""),
            _ => {
                // Try to parse as number (non-zero is true)
                if let Ok(n) = expr.parse::<f64>() {
                    Ok(n != 0.0)
                } else {
                    Ok(!expr.is_empty())
                }
            }
        }
    }
    
    fn parse_number(&self, s: &str) -> Result<f64, ExecutionError> {
        s.parse::<f64>().map_err(|_| {
            ExecutionError::condition_error(format!("Cannot parse '{}' as number", s))
        })
    }
}

#[async_trait]
impl NodeExecutor for ConditionExecutor {
    async fn execute(
        &self,
        node: &Node,
        context: &mut ExecutionContext,
    ) -> Result<NodeOutput, ExecutionError> {
        self.execute_internal(node, context).await
    }
    
    fn node_type(&self) -> NodeType {
        NodeType::Condition
    }
}

impl Default for ConditionExecutor {
    fn default() -> Self {
        Self::new()
    }
}
