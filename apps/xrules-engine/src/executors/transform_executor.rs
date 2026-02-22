use handlebars::Handlebars;
use serde_json::Value;
use std::collections::HashMap;

/// Transform engine for data transformations
pub struct TransformEngine {
    handlebars: Handlebars<'static>,
}

impl TransformEngine {
    pub fn new() -> Self {
        let mut handlebars = Handlebars::new();
        handlebars.set_strict_mode(false);
        
        Self::register_helpers(&mut handlebars);
        
        Self { handlebars }
    }
    
    /// Transform data using a template
    pub fn transform(&self, template: &str, data: &Value) -> Result<Value, crate::models::ExecutionError> {
        // Check if template is JSON
        let trimmed = template.trim();
        
        if trimmed.starts_with('{') || trimmed.starts_with('[') {
            // JSON template - process with Handlebars
            let rendered = self.handlebars
                .render_template(template, data)
                .map_err(|e| crate::models::ExecutionError::transform_error(format!("Template error: {}", e)))?;
            
            serde_json::from_str(&rendered)
                .map_err(|e| crate::models::ExecutionError::transform_error(format!("JSON parse error: {}", e)))
        } else {
            // String template
            let rendered = self.handlebars
                .render_template(template, data)
                .map_err(|e| crate::models::ExecutionError::transform_error(format!("Template error: {}", e)))?;
            
            Ok(Value::String(rendered))
        }
    }
    
    /// Map fields from input to output
    pub fn map_fields(
        &self,
        mapping: &HashMap<String, String>,
        input: &Value,
    ) -> Result<Value, crate::models::ExecutionError> {
        let mut output = serde_json::Map::new();
        
        for (target_field, source_path) in mapping {
            let value = self.get_value_at_path(input, source_path);
            if let Some(v) = value {
                output.insert(target_field.clone(), v.clone());
            }
        }
        
        Ok(Value::Object(output))
    }
    
    /// Filter array elements
    pub fn filter(&self, array: &[Value], condition: &str) -> Vec<Value> {
        // Simple condition parsing for demonstration
        // In production, use a proper expression evaluator
        array.iter().filter(|item| {
            // Check if condition matches
            // e.g., "age > 18" or "status == 'active'"
            self.evaluate_condition(item, condition).unwrap_or(false)
        }).cloned().collect()
    }
    
    /// Sort array elements
    pub fn sort(&self, array: &mut [Value], path: &str, ascending: bool) {
        array.sort_by(|a, b| {
            let a_val = self.get_value_at_path(a, path);
            let b_val = self.get_value_at_path(b, path);
            
            let ordering = match (a_val, b_val) {
                (Some(Value::String(a)), Some(Value::String(b))) => a.cmp(b),
                (Some(Value::Number(a)), Some(Value::Number(b))) => {
                    if let (Some(a_f), Some(b_f)) = (a.as_f64(), b.as_f64()) {
                        a_f.partial_cmp(&b_f).unwrap_or(std::cmp::Ordering::Equal)
                    } else {
                        std::cmp::Ordering::Equal
                    }
                }
                _ => std::cmp::Ordering::Equal,
            };
            
            if ascending { ordering } else { ordering.reverse() }
        });
    }
    
    /// Aggregate array elements
    pub fn aggregate(&self, array: &[Value], operation: &str, path: Option<&str>) -> Result<Value, crate::models::ExecutionError> {
        match operation {
            "count" => Ok(Value::Number(array.len().into())),
            "sum" => {
                let sum: f64 = array.iter()
                    .filter_map(|v| {
                        let val = path.map(|p| self.get_value_at_path(v, p)).flatten().unwrap_or(v.clone());
                        val.as_f64()
                    })
                    .sum();
                Ok(Value::Number(serde_json::Number::from_f64(sum).unwrap_or(0.into())))
            }
            "avg" => {
                let values: Vec<f64> = array.iter()
                    .filter_map(|v| {
                        let val = path.map(|p| self.get_value_at_path(v, p)).flatten().unwrap_or(v.clone());
                        val.as_f64()
                    })
                    .collect();
                
                if values.is_empty() {
                    Ok(Value::Null)
                } else {
                    let avg: f64 = values.iter().sum::<f64>() / values.len() as f64;
                    Ok(Value::Number(serde_json::Number::from_f64(avg).unwrap_or(0.into())))
                }
            }
            "max" => {
                let max = array.iter()
                    .filter_map(|v| {
                        let val = path.map(|p| self.get_value_at_path(v, p)).flatten().unwrap_or(v.clone());
                        val.as_f64()
                    })
                    .fold(None, |acc, v| Some(acc.map_or(v, |m: f64| m.max(v))));
                
                Ok(max.map(|m| Value::Number(serde_json::Number::from_f64(m).unwrap_or(0.into()))).unwrap_or(Value::Null))
            }
            "min" => {
                let min = array.iter()
                    .filter_map(|v| {
                        let val = path.map(|p| self.get_value_at_path(v, p)).flatten().unwrap_or(v.clone());
                        val.as_f64()
                    })
                    .fold(None, |acc, v| Some(acc.map_or(v, |m: f64| m.min(v))));
                
                Ok(min.map(|m| Value::Number(serde_json::Number::from_f64(m).unwrap_or(0.into()))).unwrap_or(Value::Null))
            }
            _ => Err(crate::models::ExecutionError::transform_error(format!("Unknown aggregation: {}", operation))),
        }
    }
    
    /// Get value at path
    fn get_value_at_path(&self, value: &Value, path: &str) -> Option<&Value> {
        let parts: Vec<&str> = path.split('.').collect();
        
        let mut current = value;
        for part in &parts {
            current = match current {
                Value::Object(map) => map.get(*part)?,
                Value::Array(arr) => {
                    let index = part.parse::<usize>().ok()?;
                    arr.get(index)?
                }
                _ => return None,
            };
        }
        
        Some(current)
    }
    
    /// Evaluate a simple condition
    fn evaluate_condition(&self, item: &Value, condition: &str) -> Option<bool> {
        // Simple condition evaluator
        // Supports: field == value, field != value, field > value, field < value
        
        let parts: Vec<&str> = condition.split_whitespace().collect();
        if parts.len() != 3 {
            return None;
        }
        
        let field = parts[0];
        let op = parts[1];
        let value = parts[2].trim_matches('\'').trim_matches('"');
        
        let field_value = self.get_value_at_path(item, field)?;
        let field_str = field_value.as_str().unwrap_or(&field_value.to_string());
        
        match op {
            "==" => Some(field_str == value),
            "!=" => Some(field_str != value),
            ">" => {
                let field_num = field_value.as_f64()?;
                let val_num = value.parse::<f64>().ok()?;
                Some(field_num > val_num)
            }
            "<" => {
                let field_num = field_value.as_f64()?;
                let val_num = value.parse::<f64>().ok()?;
                Some(field_num < val_num)
            }
            ">=" => {
                let field_num = field_value.as_f64()?;
                let val_num = value.parse::<f64>().ok()?;
                Some(field_num >= val_num)
            }
            "<=" => {
                let field_num = field_value.as_f64()?;
                let val_num = value.parse::<f64>().ok()?;
                Some(field_num <= val_num)
            }
            _ => None,
        }
    }
    
    fn register_helpers(handlebars: &mut Handlebars) {
        // Date helper
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
        
        // Uppercase helper
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
        
        // Lowercase helper
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
        
        // JSON stringify helper
        handlebars.register_helper("json", Box::new(
            |h: &handlebars::Helper<'_>,
             _: &handlebars::Handlebars<'_>,
             _: &handlebars::Context,
             _: &mut handlebars::RenderContext<'_, '_>,
             out: &mut dyn handlebars::Output| {
                let val = h.param(0)
                    .map(|v| v.value())
                    .unwrap_or(&Value::Null);
                out.write(&serde_json::to_string(val).unwrap_or_default())?;
                Ok(())
            }
        ));
    }
}

impl Default for TransformEngine {
    fn default() -> Self {
        Self::new()
    }
}
