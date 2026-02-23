use crate::engines::rules::context::ExecutionContext;
use crate::engines::rules::nodes::types::NodeExecutor;
use crate::engines::EngineError;
use crate::engines::rules::Result;
use serde::Deserialize;
use serde_json::Value;
use std::future::Future;
use std::pin::Pin;

pub struct ConditionNode;

#[derive(Debug, Deserialize)]
struct ConditionConfig {
    field: String,
    operator: String,
    value: Value,
}

impl NodeExecutor for ConditionNode {
    fn execute<'a>(
        &'a self,
        config: &'a Value,
        context: &'a mut ExecutionContext,
    ) -> Pin<Box<dyn Future<Output = Result<Value>> + Send + 'a>> {
        Box::pin(async move {
            let cfg: ConditionConfig = serde_json::from_value(config.clone())
                .map_err(|e| EngineError::Validation(format!("Invalid condition config: {}", e)))?;
            
            let field_value = context.get_variable(&cfg.field)
                .or_else(|| Some(&context.input))
                .unwrap_or(&Value::Null);
            
            let result = match cfg.operator.as_str() {
                "equals" => field_value == &cfg.value,
                "not_equals" => field_value != &cfg.value,
                "greater_than" => compare_values(field_value, &cfg.value) > 0,
                "less_than" => compare_values(field_value, &cfg.value) < 0,
                "contains" => contains_value(field_value, &cfg.value),
                "exists" => !field_value.is_null(),
                _ => false,
            };
            
            Ok(Value::Bool(result))
        })
    }
}

fn compare_values(a: &Value, b: &Value) -> i32 {
    match (a, b) {
        (Value::Number(n1), Value::Number(n2)) => {
            let f1 = n1.as_f64().unwrap_or(0.0);
            let f2 = n2.as_f64().unwrap_or(0.0);
            if f1 > f2 { 1 } else if f1 < f2 { -1 } else { 0 }
        }
        (Value::String(s1), Value::String(s2)) => s1.cmp(s2) as i32,
        _ => 0,
    }
}

fn contains_value(container: &Value, item: &Value) -> bool {
    match container {
        Value::String(s) => {
            if let Value::String(item_str) = item {
                s.contains(item_str)
            } else {
                false
            }
        }
        Value::Array(arr) => arr.contains(item),
        Value::Object(obj) => {
            if let Value::String(key) = item {
                obj.contains_key(key)
            } else {
                false
            }
        }
        _ => false,
    }
}
