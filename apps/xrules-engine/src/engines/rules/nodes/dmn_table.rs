use crate::engines::rules::context::ExecutionContext;
use crate::engines::rules::nodes::types::NodeExecutor;
use crate::engines::EngineError;
use crate::engines::rules::Result;
use serde::Deserialize;
use serde_json::Value;
use std::future::Future;
use std::pin::Pin;

pub struct DmnTableNode;

#[derive(Debug, Deserialize)]
struct DmnConfig {
    hit_policy: String,
    inputs: Vec<DmnInput>,
    outputs: Vec<DmnOutput>,
    rules: Vec<DmnRule>,
}

#[derive(Debug, Deserialize)]
struct DmnInput {
    name: String,
    expression: String,
}

#[derive(Debug, Deserialize)]
struct DmnOutput {
    name: String,
}

#[derive(Debug, Deserialize)]
struct DmnRule {
    inputs: Vec<String>,
    outputs: Vec<Value>,
}

impl NodeExecutor for DmnTableNode {
    fn execute<'a>(
        &'a self,
        config: &'a Value,
        context: &'a mut ExecutionContext,
    ) -> Pin<Box<dyn Future<Output = Result<Value>> + Send + 'a>> {
        Box::pin(async move {
            let dmn: DmnConfig = serde_json::from_value(config.clone())
                .map_err(|e| EngineError::Validation(format!("Invalid DMN config: {}", e)))?;
            
            let input = &context.input;
            let mut matches = vec![];
            
            for rule in &dmn.rules {
                let mut rule_matches = true;
                
                for (i, rule_input) in rule.inputs.iter().enumerate() {
                    let dmn_in = dmn.inputs.get(i)
                        .ok_or_else(|| EngineError::Validation("Invalid DMN input count".to_string()))?;
                    
                    let actual_value = extract_value(input, &dmn_in.name)?;
                    
                    if !evaluate_feel(&actual_value, rule_input)? {
                        rule_matches = false;
                        break;
                    }
                }
                
                if rule_matches {
                    matches.push(rule);
                }
            }
            
            apply_hit_policy(&dmn, &matches)
        })
    }
}

fn extract_value(input: &Value, path: &str) -> Result<Value> {
    let parts: Vec<&str> = path.split('.').collect();
    let mut current = input;
    
    for part in &parts {
        current = current.get(part)
            .ok_or_else(|| EngineError::Validation(format!("Path not found: {}", path)))?;
    }
    
    Ok(current.clone())
}

fn evaluate_feel(actual: &Value, expression: &str) -> Result<bool> {
    let expr = expression.trim();
    
    if expr == "-" || expr.is_empty() {
        return Ok(true);
    }
    
    if expr.starts_with(">=") {
        let expected = parse_number(&expr[2..])?;
        let actual = value_to_number(actual)?;
        return Ok(actual >= expected);
    }
    
    if expr.starts_with(">") {
        let expected = parse_number(&expr[1..])?;
        let actual = value_to_number(actual)?;
        return Ok(actual > expected);
    }
    
    if expr.starts_with("<=") {
        let expected = parse_number(&expr[2..])?;
        let actual = value_to_number(actual)?;
        return Ok(actual <= expected);
    }
    
    if expr.starts_with("<") {
        let expected = parse_number(&expr[1..])?;
        let actual = value_to_number(actual)?;
        return Ok(actual < expected);
    }
    
    if expr.starts_with("!=") {
        let expected = parse_value(&expr[2..])?;
        return Ok(actual != &expected);
    }
    
    if expr.starts_with('=') {
        let expected = parse_value(&expr[1..])?;
        return Ok(actual == &expected);
    }
    
    let expected = parse_value(expr)?;
    Ok(actual == &expected)
}

fn apply_hit_policy(dmn: &DmnConfig, matches: &[&DmnRule]) -> Result<Value> {
    match dmn.hit_policy.as_str() {
        "UNIQUE" => {
            if matches.len() != 1 {
                return Err(EngineError::Execution(
                    format!("UNIQUE policy: expected 1 match, got {}", matches.len())
                ));
            }
            build_output(dmn, matches[0])
        }
        "FIRST" => {
            matches.first()
                .map(|r| build_output(dmn, r))
                .unwrap_or(Ok(Value::Null))
        }
        "COLLECT" => {
            let outputs: Vec<Value> = matches.iter()
                .map(|r| build_output(dmn, r))
                .collect::<Result<Vec<_>>>()?;
            Ok(Value::Array(outputs))
        }
        "ANY" => {
            if matches.is_empty() {
                return Ok(Value::Null);
            }
            let first = build_output(dmn, matches[0])?;
            for m in &matches[1..] {
                let output = build_output(dmn, m)?;
                if output != first {
                    return Err(EngineError::Execution(
                        "ANY policy: different outputs found".to_string()
                    ));
                }
            }
            Ok(first)
        }
        _ => Err(EngineError::Validation(
            format!("Unknown hit policy: {}", dmn.hit_policy)
        ))
    }
}

fn build_output(dmn: &DmnConfig, rule: &DmnRule) -> Result<Value> {
    let mut output = serde_json::Map::new();
    
    for (i, out_val) in rule.outputs.iter().enumerate() {
        if let Some(dmn_out) = dmn.outputs.get(i) {
            output.insert(dmn_out.name.clone(), out_val.clone());
        }
    }
    
    Ok(Value::Object(output))
}

fn parse_number(s: &str) -> Result<f64> {
    s.trim().parse::<f64>()
        .map_err(|_| EngineError::Validation(format!("Not a number: {}", s)))
}

fn value_to_number(v: &Value) -> Result<f64> {
    match v {
        Value::Number(n) => n.as_f64()
            .ok_or_else(|| EngineError::Validation("Invalid number".to_string())),
        Value::String(s) => s.parse::<f64>()
            .map_err(|_| EngineError::Validation(format!("Not a number: {}", s))),
        _ => Err(EngineError::Validation("Value is not a number".to_string())),
    }
}

fn parse_value(s: &str) -> Result<Value> {
    let s = s.trim();
    
    if let Ok(n) = s.parse::<f64>() {
        return Ok(serde_json::json!(n));
    }
    
    if (s.starts_with('"') && s.ends_with('"')) || 
       (s.starts_with('\'') && s.ends_with('\'')) {
        return Ok(Value::String(s[1..s.len()-1].to_string()));
    }
    
    if s == "true" {
        return Ok(Value::Bool(true));
    }
    if s == "false" {
        return Ok(Value::Bool(false));
    }
    
    if s == "null" {
        return Ok(Value::Null);
    }
    
    Ok(Value::String(s.to_string()))
}
