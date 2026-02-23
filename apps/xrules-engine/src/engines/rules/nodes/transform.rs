use crate::engines::rules::context::ExecutionContext;
use crate::engines::rules::nodes::types::NodeExecutor;
use crate::engines::EngineError;
use crate::engines::rules::Result;
use handlebars::Handlebars;
use serde::Deserialize;
use serde_json::Value;
use std::future::Future;
use std::pin::Pin;

pub struct TransformNode;

#[derive(Debug, Deserialize)]
struct TransformConfig {
    template: String,
}

impl NodeExecutor for TransformNode {
    fn execute<'a>(
        &'a self,
        config: &'a Value,
        context: &'a mut ExecutionContext,
    ) -> Pin<Box<dyn Future<Output = Result<Value>> + Send + 'a>> {
        Box::pin(async move {
            let cfg: TransformConfig = serde_json::from_value(config.clone())
                .map_err(|e| EngineError::Validation(format!("Invalid transform config: {}", e)))?;
            
            let mut handlebars = Handlebars::new();
            handlebars.set_strict_mode(false);
            
            let mut data = serde_json::Map::new();
            data.insert("input".to_string(), context.input.clone());
            
            for (key, value) in &context.variables {
                data.insert(key.clone(), value.clone());
            }
            
            let template_data = Value::Object(data);
            
            let rendered = handlebars
                .render_template(&cfg.template, &template_data)
                .map_err(|e| EngineError::Execution(format!("Template render error: {}", e)))?;
            
            match serde_json::from_str(&rendered) {
                Ok(json) => Ok(json),
                Err(_) => Ok(Value::String(rendered)),
            }
        })
    }
}
