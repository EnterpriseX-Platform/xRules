use async_trait::async_trait;

use crate::engine::NodeExecutor;
use crate::models::{ExecutionContext, ExecutionError, Node, NodeOutput, NodeType};

/// Executor for API output nodes (response formatting)
pub struct ApiOutputExecutor;

impl ApiOutputExecutor {
    pub fn new() -> Self {
        Self
    }
    
    async fn execute_internal(
        &self,
        node: &Node,
        context: &mut ExecutionContext,
    ) -> Result<NodeOutput, ExecutionError> {
        context.log_info(&node.id, "API Output node - formatting response");
        
        // Get the response structure from node config or use context variables
        let output = if let Some(response_schema) = node.data.get("response") {
            // Build response based on schema
            self.build_response(response_schema, context)?
        } else if let Some(template) = node.data.get("template") {
            // Use template
            template.clone()
        } else {
            // Default: use all context variables
            serde_json::json!({
                "success": true,
                "data": context.variables,
                "execution_id": context.execution_id.to_string(),
            })
        };
        
        // Apply status code if specified
        if let Some(status_code) = node.data.get("statusCode").and_then(|v| v.as_u64()) {
            context.set_variable("__statusCode", serde_json::json!(status_code));
        }
        
        // Apply headers if specified
        if let Some(headers) = node.data.get("headers") {
            context.set_variable("__headers", headers.clone());
        }
        
        // Store the output in context
        context.set_variable("__output", output.clone());
        
        Ok(NodeOutput::new(output))
    }
    
    fn build_response(
        &self,
        schema: &serde_json::Value,
        context: &ExecutionContext,
    ) -> Result<serde_json::Value, ExecutionError> {
        match schema {
            serde_json::Value::Object(map) => {
                let mut result = serde_json::Map::new();
                for (key, value) in map {
                    let resolved = self.resolve_value(value, context)?;
                    result.insert(key.clone(), resolved);
                }
                Ok(serde_json::Value::Object(result))
            }
            serde_json::Value::String(s) => {
                // If it's a string, treat it as a variable reference
                self.resolve_variable(s, context)
            }
            other => Ok(other.clone()),
        }
    }
    
    fn resolve_value(
        &self,
        value: &serde_json::Value,
        context: &ExecutionContext,
    ) -> Result<serde_json::Value, ExecutionError> {
        match value {
            serde_json::Value::String(s) => {
                // Check for variable reference patterns
                if s.starts_with("$") {
                    self.resolve_variable(s, context)
                } else {
                    Ok(value.clone())
                }
            }
            serde_json::Value::Object(map) => {
                let mut result = serde_json::Map::new();
                for (k, v) in map {
                    result.insert(k.clone(), self.resolve_value(v, context)?);
                }
                Ok(serde_json::Value::Object(result))
            }
            serde_json::Value::Array(arr) => {
                let mut result = Vec::new();
                for v in arr {
                    result.push(self.resolve_value(v, context)?);
                }
                Ok(serde_json::Value::Array(result))
            }
            other => Ok(other.clone()),
        }
    }
    
    fn resolve_variable(
        &self,
        path: &str,
        context: &ExecutionContext,
    ) -> Result<serde_json::Value, ExecutionError> {
        // Remove $ prefix if present
        let path = path.trim_start_matches('$');
        
        // Split path by dots
        let parts: Vec<&str> = path.split('.').collect();
        
        if parts.is_empty() {
            return Ok(serde_json::Value::Null);
        }
        
        let mut current = context.get_variable(parts[0])
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        
        for part in &parts[1..] {
            if let serde_json::Value::Object(map) = current {
                current = map.get(*part).cloned().unwrap_or(serde_json::Value::Null);
            } else if let serde_json::Value::Array(arr) = current {
                if let Ok(index) = part.parse::<usize>() {
                    current = arr.get(index).cloned().unwrap_or(serde_json::Value::Null);
                } else {
                    current = serde_json::Value::Null;
                }
            } else {
                current = serde_json::Value::Null;
            }
        }
        
        Ok(current)
    }
}

#[async_trait]
impl NodeExecutor for ApiOutputExecutor {
    async fn execute(
        &self,
        node: &Node,
        context: &mut ExecutionContext,
    ) -> Result<NodeOutput, ExecutionError> {
        self.execute_internal(node, context).await
    }
    
    fn node_type(&self) -> NodeType {
        NodeType::ApiOutput
    }
}

impl Default for ApiOutputExecutor {
    fn default() -> Self {
        Self::new()
    }
}
