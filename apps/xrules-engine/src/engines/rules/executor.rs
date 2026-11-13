use crate::engines::rules::context::ExecutionContext;
use crate::engines::rules::nodes::NodeRegistry;
use crate::engines::EngineError;
use crate::engines::rules::Result;
use crate::hub::router::Rule;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::info;

pub struct RulesExecutor<'a> {
    node_registry: &'a NodeRegistry,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RuleDefinition {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dmn: Option<DmnDefinition>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Node {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub data: Value,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Edge {
    pub id: String,
    pub source: String,
    pub target: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DmnDefinition {
    pub hit_policy: String, // UNIQUE, FIRST, COLLECT, ANY
    pub inputs: Vec<DmnInput>,
    pub outputs: Vec<DmnOutput>,
    pub rules: Vec<DmnRule>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DmnInput {
    pub name: String,
    pub expression: String,
    #[serde(rename = "type")]
    pub input_type: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DmnOutput {
    pub name: String,
    pub label: String,
    #[serde(rename = "type")]
    pub output_type: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DmnRule {
    pub id: String,
    pub inputs: Vec<String>, // FEEL expressions: ">= 18", "= 'HIGH'", etc.
    pub outputs: Vec<Value>,
}

impl<'a> RulesExecutor<'a> {
    pub fn new_stateless(node_registry: &'a NodeRegistry) -> Self {
        Self { node_registry }
    }
    
    pub async fn execute(&self, rule: &Rule, input: Value) -> Result<Value> {
        info!("RulesEngine executing rule: {}", rule.id);
        
        let definition: RuleDefinition = serde_json::from_value(rule.definition.clone())
            .map_err(|e| EngineError::Validation(format!("Invalid rule definition: {}", e)))?;
        
        // Check if DMN table exists
        if let Some(dmn) = definition.dmn {
            return self.execute_dmn(&dmn, &input).await;
        }
        
        // Execute flow-based rules
        self.execute_flow(&definition, input).await
    }
    
    async fn execute_dmn(&self, dmn: &DmnDefinition, input: &Value) -> Result<Value> {
        let mut matches = vec![];
        
        for rule in &dmn.rules {
            let mut rule_matches = true;
            
            for (i, rule_input) in rule.inputs.iter().enumerate() {
                let dmn_input = dmn.inputs.get(i)
                    .ok_or_else(|| EngineError::Validation("Invalid DMN input count".to_string()))?;
                
                let actual_value = self.extract_value(input, &dmn_input.name)?;
                
                if !self.evaluate_feel(&actual_value, rule_input)? {
                    rule_matches = false;
                    break;
                }
            }
            
            if rule_matches {
                matches.push(rule);
            }
        }
        
        // Apply hit policy
        self.apply_hit_policy(dmn, &matches)
    }
    
    async fn execute_flow(&self, definition: &RuleDefinition, input: Value) -> Result<Value> {
        let mut context = ExecutionContext::new(input);
        let mut current_output = Value::Null;
        
        for node in &definition.nodes {
            let executor = self.node_registry.get(&node.node_type)?;
            current_output = executor.execute(&node.data, &mut context).await?;
            context.set_variable(&node.id, current_output.clone());
        }
        
        Ok(current_output)
    }
    
    fn extract_value(&self, input: &Value, path: &str) -> Result<Value> {
        // Simple path extraction: "customer.age" -> input["customer"]["age"]
        let parts: Vec<&str> = path.split('.').collect();
        let mut current = input;
        
        for part in &parts {
            current = current.get(part)
                .ok_or_else(|| EngineError::Validation(format!("Path not found: {}", path)))?;
        }
        
        Ok(current.clone())
    }
    
    fn evaluate_feel(&self, actual: &Value, expression: &str) -> Result<bool> {
        // Simplified FEEL evaluation
        // Supports: "> 18", ">= 18", "< 18", "<= 18", "= 'value'", "!= 'value'"
        let expr = expression.trim();
        
        if expr == "-" || expr == "" {
            return Ok(true); // Dash means "any value"
        }
        
        // Parse comparison operators
        if expr.starts_with(">=") {
            let expected = self.parse_number(&expr[2..])?;
            let actual = self.value_to_number(actual)?;
            return Ok(actual >= expected);
        }
        
        if expr.starts_with(">") {
            let expected = self.parse_number(&expr[1..])?;
            let actual = self.value_to_number(actual)?;
            return Ok(actual > expected);
        }
        
        if expr.starts_with("<=") {
            let expected = self.parse_number(&expr[2..])?;
            let actual = self.value_to_number(actual)?;
            return Ok(actual <= expected);
        }
        
        if expr.starts_with("<") {
            let expected = self.parse_number(&expr[1..])?;
            let actual = self.value_to_number(actual)?;
            return Ok(actual < expected);
        }
        
        if expr.starts_with("!=") {
            let expected = self.parse_value(&expr[2..])?;
            return Ok(actual != &expected);
        }
        
        if expr.starts_with('=') {
            let expected = self.parse_value(&expr[1..])?;
            return Ok(actual == &expected);
        }
        
        // Default: exact match
        let expected = self.parse_value(expr)?;
        Ok(actual == &expected)
    }
    
    fn apply_hit_policy(&self, dmn: &DmnDefinition, matches: &[&DmnRule]) -> Result<Value> {
        match dmn.hit_policy.as_str() {
            "UNIQUE" => {
                if matches.len() != 1 {
                    return Err(EngineError::Execution(
                        format!("UNIQUE policy: expected 1 match, got {}", matches.len())
                    ));
                }
                self.build_output(dmn, matches[0])
            }
            "FIRST" => {
                matches.first()
                    .map(|r| self.build_output(dmn, r))
                    .unwrap_or(Ok(Value::Null))
            }
            "COLLECT" => {
                let outputs: Vec<Value> = matches.iter()
                    .map(|r| self.build_output(dmn, r))
                    .collect::<Result<Vec<_>>>()?;
                Ok(Value::Array(outputs))
            }
            "ANY" => {
                if matches.is_empty() {
                    return Ok(Value::Null);
                }
                let first = self.build_output(dmn, matches[0])?;
                for m in &matches[1..] {
                    let output = self.build_output(dmn, m)?;
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
    
    fn build_output(&self, dmn: &DmnDefinition, rule: &DmnRule) -> Result<Value> {
        let mut output = serde_json::Map::new();
        
        for (i, out_val) in rule.outputs.iter().enumerate() {
            if let Some(dmn_out) = dmn.outputs.get(i) {
                output.insert(dmn_out.name.clone(), out_val.clone());
            }
        }
        
        Ok(Value::Object(output))
    }
    
    fn parse_number(&self, s: &str) -> Result<f64> {
        s.trim().parse::<f64>()
            .map_err(|_| EngineError::Validation(format!("Not a number: {}", s)))
    }
    
    fn value_to_number(&self, v: &Value) -> Result<f64> {
        match v {
            Value::Number(n) => n.as_f64()
                .ok_or_else(|| EngineError::Validation("Invalid number".to_string())),
            Value::String(s) => s.parse::<f64>()
                .map_err(|_| EngineError::Validation(format!("Not a number: {}", s))),
            _ => Err(EngineError::Validation("Value is not a number".to_string())),
        }
    }
    
    fn parse_value(&self, s: &str) -> Result<Value> {
        let s = s.trim();
        
        // Try number first
        if let Ok(n) = s.parse::<f64>() {
            return Ok(serde_json::json!(n));
        }
        
        // String literal (quoted)
        if (s.starts_with('"') && s.ends_with('"')) || 
           (s.starts_with('\'') && s.ends_with('\'')) {
            return Ok(Value::String(s[1..s.len()-1].to_string()));
        }
        
        // Boolean
        if s == "true" {
            return Ok(Value::Bool(true));
        }
        if s == "false" {
            return Ok(Value::Bool(false));
        }
        
        // Null
        if s == "null" {
            return Ok(Value::Null);
        }
        
        // Unquoted string
        Ok(Value::String(s.to_string()))
    }
}
