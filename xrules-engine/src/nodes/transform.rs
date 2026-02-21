use async_trait::async_trait;
use handlebars::Handlebars;
use serde_json::json;

use crate::engine::NodeExecutor;
use crate::models::{ExecutionContext, ExecutionError, Node, NodeOutput, NodeType};

/// Executor for transform nodes (data transformation)
pub struct TransformExecutor {
    handlebars: Handlebars<'static>,
}

impl TransformExecutor {
    pub fn new() -> Self {
        let mut handlebars = Handlebars::new();
        handlebars.set_strict_mode(false);
        
        // Register helpers
        Self::register_helpers(&mut handlebars);
        
        Self { handlebars }
    }
    
    async fn execute_internal(
        &self,
        node: &Node,
        context: &mut ExecutionContext,
    ) -> Result<NodeOutput, ExecutionError> {
        // Get the transformation specification
        let transform = node.data.get("transform")
            .or_else(|| node.data.get("template"))
            .ok_or_else(|| ExecutionError::node_error(
                &node.id,
                "Transform node must have a 'transform' or 'template' field"
            ))?;
        
        context.log_debug(&node.id, "Applying transformation");
        
        let result = match transform {
            serde_json::Value::String(template) => {
                // Template-based transformation using Handlebars
                self.apply_template(node, template, context).await?
            }
            serde_json::Value::Object(map) if map.contains_key("mapping") => {
                // Field mapping transformation
                self.apply_mapping(node, map, context).await?
            }
            serde_json::Value::Object(map) if map.contains_key("jsonata") => {
                // JSONata-like transformation (simplified)
                self.apply_jsonata(node, map, context).await?
            }
            serde_json::Value::Object(_) => {
                // Direct object transformation
                self.transform_object(node, transform, context).await?
            }
            _ => {
                return Err(ExecutionError::transform_error(
                    "Invalid transform specification"
                ));
            }
        };
        
        context.log_info(&node.id, "Transformation completed");
        
        // Store result
        context.set_variable("output", result.clone());
        context.set_variable(format!("{}_output", node.id), result.clone());
        
        Ok(NodeOutput::new(result))
    }
    
    async fn apply_template(
        &self,
        node: &Node,
        template: &str,
        context: &ExecutionContext,
    ) -> Result<serde_json::Value, ExecutionError> {
        // Prepare data for template
        let data = json!({
            "input": context.get_variable("input").cloned().unwrap_or_default(),
            "vars": context.variables,
            "execution": {
                "id": context.execution_id.to_string(),
                "flow_id": context.flow_id.to_string(),
            }
        });
        
        // Check if template is JSON template or string template
        if template.trim().starts_with('{') || template.trim().starts_with('[') {
            // JSON template - process as Handlebars
            let rendered = self.handlebars
                .render_template(template, &data)
                .map_err(|e| ExecutionError::transform_error(format!("Template error: {}", e)))?;
            
            // Parse as JSON
            serde_json::from_str(&rendered)
                .map_err(|e| ExecutionError::transform_error(format!("JSON parse error: {}", e)))
        } else {
            // String template
            let rendered = self.handlebars
                .render_template(template, &data)
                .map_err(|e| ExecutionError::transform_error(format!("Template error: {}", e)))?;
            
            Ok(json!(rendered))
        }
    }
    
    async fn apply_mapping(
        &self,
        _node: &Node,
        map: &serde_json::Map<String, serde_json::Value>,
        context: &ExecutionContext,
    ) -> Result<serde_json::Value, ExecutionError> {
        let mapping = map.get("mapping")
            .and_then(|v| v.as_object())
            .ok_or_else(|| ExecutionError::transform_error("Invalid mapping specification"))?;
        
        let mut result = serde_json::Map::new();
        
        for (target_field, source) in mapping {
            let value = match source {
                serde_json::Value::String(path) => {
                    // Path like "input.user.name" or "$user.name"
                    self.resolve_path(path, context)
                }
                serde_json::Value::Object(op) if op.contains_key("expr") => {
                    // Expression
                    let expr = op.get("expr").and_then(|v| v.as_str()).unwrap_or("");
                    self.evaluate_expression(expr, context)
                }
                serde_json::Value::Object(op) if op.contains_key("template") => {
                    // Handlebars template
                    let template = op.get("template").and_then(|v| v.as_str()).unwrap_or("");
                    let data = json!({ "vars": context.variables });
                    self.handlebars
                        .render_template(template, &data)
                        .map(|s| json!(s))
                        .unwrap_or_default()
                }
                other => other.clone(),
            };
            
            result.insert(target_field.clone(), value);
        }
        
        Ok(serde_json::Value::Object(result))
    }
    
    async fn apply_jsonata(
        &self,
        _node: &Node,
        map: &serde_json::Map<String, serde_json::Value>,
        context: &ExecutionContext,
    ) -> Result<serde_json::Value, ExecutionError> {
        let expr = map.get("jsonata")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ExecutionError::transform_error("Invalid JSONata expression"))?;
        
        // Simplified JSONata implementation
        // In production, you would use a proper JSONata library
        self.evaluate_jsonata(expr, context)
    }
    
    async fn transform_object(
        &self,
        _node: &Node,
        obj: &serde_json::Value,
        context: &ExecutionContext,
    ) -> Result<serde_json::Value, ExecutionError> {
        // Recursively transform the object, resolving variable references
        self.transform_value(obj, context)
    }
    
    fn transform_value(
        &self,
        value: &serde_json::Value,
        context: &ExecutionContext,
    ) -> Result<serde_json::Value, ExecutionError> {
        match value {
            serde_json::Value::String(s) => {
                // Check for variable reference
                if s.starts_with("$") {
                    Ok(self.resolve_path(s, context))
                } else {
                    Ok(value.clone())
                }
            }
            serde_json::Value::Object(map) => {
                let mut result = serde_json::Map::new();
                for (k, v) in map {
                    result.insert(k.clone(), self.transform_value(v, context)?);
                }
                Ok(serde_json::Value::Object(result))
            }
            serde_json::Value::Array(arr) => {
                let mut result = Vec::new();
                for v in arr {
                    result.push(self.transform_value(v, context)?);
                }
                Ok(serde_json::Value::Array(result))
            }
            other => Ok(other.clone()),
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
    
    fn evaluate_expression(&self, _expr: &str, context: &ExecutionContext) -> serde_json::Value {
        // Simplified expression evaluation
        // In production, use a proper expression evaluator
        json!({ "vars": context.variables.len() })
    }
    
    fn evaluate_jsonata(&self, _expr: &str, _context: &ExecutionContext) -> Result<serde_json::Value, ExecutionError> {
        // Simplified JSONata evaluation
        // In production, use a proper JSONata implementation
        Ok(serde_json::json!({}))
    }
    
    fn register_helpers(handlebars: &mut Handlebars) {
        // Register date helper
        handlebars.register_helper("date", Box::new(
            |h: &handlebars::Helper<'_>,
             _: &handlebars::Handlebars<'_>,
             _: &handlebars::Context,
             _: &mut handlebars::RenderContext<'_, '_>,
             out: &mut dyn handlebars::Output| {
                let format = h.param(0)
                    .and_then(|v| v.value().as_str())
                    .unwrap_or("%Y-%m-%d");
                let now = chrono::Local::now();
                out.write(&now.format(format).to_string())?;
                Ok(())
            }
        ));
        
        // Register uppercase helper
        handlebars.register_helper("upper", Box::new(
            |h: &handlebars::Helper<'_>,
             _: &handlebars::Handlebars<'_>,
             _: &handlebars::Context,
             _: &mut handlebars::RenderContext<'_, '_>,
             out: &mut dyn handlebars::Output| {
                let val = h.param(0)
                    .and_then(|v| v.value().as_str())
                    .unwrap_or("");
                out.write(&val.to_uppercase())?;
                Ok(())
            }
        ));
        
        // Register lowercase helper
        handlebars.register_helper("lower", Box::new(
            |h: &handlebars::Helper<'_>,
             _: &handlebars::Handlebars<'_>,
             _: &handlebars::Context,
             _: &mut handlebars::RenderContext<'_, '_>,
             out: &mut dyn handlebars::Output| {
                let val = h.param(0)
                    .and_then(|v| v.value().as_str())
                    .unwrap_or("");
                out.write(&val.to_lowercase())?;
                Ok(())
            }
        ));
    }
}

#[async_trait]
impl NodeExecutor for TransformExecutor {
    async fn execute(
        &self,
        node: &Node,
        context: &mut ExecutionContext,
    ) -> Result<NodeOutput, ExecutionError> {
        self.execute_internal(node, context).await
    }
    
    fn node_type(&self) -> NodeType {
        NodeType::Transform
    }
}

impl Default for TransformExecutor {
    fn default() -> Self {
        Self::new()
    }
}
