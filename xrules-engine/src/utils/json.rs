use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{Map, Value};

/// JSON extensions
pub trait JsonExt {
    fn get_path(&self, path: &str) -> Option<&Value>;
    fn get_path_mut(&mut self, path: &str) -> Option<&mut Value>;
    fn set_path(&mut self, path: &str, value: Value) -> Result<(), String>;
    fn merge(&mut self, other: Value);
    fn flatten(&self) -> Map<String, Value>;
}

impl JsonExt for Value {
    fn get_path(&self, path: &str) -> Option<&Value> {
        let parts: Vec<&str> = path.split('.').collect();
        let mut current = self;
        
        for part in parts {
            current = match current {
                Value::Object(map) => map.get(part)?,
                Value::Array(arr) => {
                    let index = part.parse::<usize>().ok()?;
                    arr.get(index)?
                }
                _ => return None,
            };
        }
        
        Some(current)
    }
    
    fn get_path_mut(&mut self, path: &str) -> Option<&mut Value> {
        let parts: Vec<&str> = path.split('.').collect();
        let mut current = self;
        
        for (i, part) in parts.iter().enumerate() {
            if i == parts.len() - 1 {
                return match current {
                    Value::Object(map) => map.get_mut(*part),
                    Value::Array(arr) => {
                        let index = part.parse::<usize>().ok()?;
                        arr.get_mut(index)
                    }
                    _ => None,
                };
            }
            
            current = match current {
                Value::Object(map) => map.get_mut(*part)?,
                Value::Array(arr) => {
                    let index = part.parse::<usize>().ok()?;
                    arr.get_mut(index)?
                }
                _ => return None,
            };
        }
        
        None
    }
    
    fn set_path(&mut self, path: &str, value: Value) -> Result<(), String> {
        let parts: Vec<&str> = path.split('.').collect();
        
        if parts.is_empty() {
            return Err("Empty path".to_string());
        }
        
        let mut current = self;
        
        for (i, part) in parts.iter().enumerate() {
            if i == parts.len() - 1 {
                match current {
                    Value::Object(map) => {
                        map.insert(part.to_string(), value);
                        return Ok(());
                    }
                    _ => return Err("Cannot set value on non-object".to_string()),
                }
            }
            
            match current {
                Value::Object(map) => {
                    if !map.contains_key(*part) {
                        map.insert(part.to_string(), Value::Object(Map::new()));
                    }
                    current = map.get_mut(*part).unwrap();
                }
                _ => return Err("Cannot navigate through non-object".to_string()),
            }
        }
        
        Ok(())
    }
    
    fn merge(&mut self, other: Value) {
        match (self, other) {
            (Value::Object(base_map), Value::Object(other_map)) => {
                for (key, value) in other_map {
                    if let Some(base_value) = base_map.get_mut(&key) {
                        base_value.merge(value);
                    } else {
                        base_map.insert(key, value);
                    }
                }
            }
            (base, other) => *base = other,
        }
    }
    
    fn flatten(&self) -> Map<String, Value> {
        let mut result = Map::new();
        flatten_internal(self, "", &mut result);
        result
    }
}

fn flatten_internal(value: &Value, prefix: &str, result: &mut Map<String, Value>) {
    match value {
        Value::Object(map) => {
            for (key, val) in map {
                let new_key = if prefix.is_empty() {
                    key.clone()
                } else {
                    format!("{}.{}", prefix, key)
                };
                flatten_internal(val, &new_key, result);
            }
        }
        Value::Array(arr) => {
            for (i, val) in arr.iter().enumerate() {
                let new_key = format!("{}[{}]", prefix, i);
                flatten_internal(val, &new_key, result);
            }
        }
        _ => {
            result.insert(prefix.to_string(), value.clone());
        }
    }
}

/// JSONPath-like query
pub struct JsonPath<'a> {
    value: &'a Value,
}

impl<'a> JsonPath<'a> {
    pub fn new(value: &'a Value) -> Self {
        Self { value }
    }
    
    /// Query using simple path syntax
    pub fn query(&self, path: &str) -> Vec<&'a Value> {
        let mut results = Vec::new();
        self.query_internal(self.value, path, &mut results);
        results
    }
    
    /// Get single value at path
    pub fn get(&self, path: &str) -> Option<&'a Value> {
        self.value.get_path(path)
    }
    
    fn query_internal(&self, value: &'a Value, path: &str, results: &mut Vec<&'a Value>) {
        if path.is_empty() {
            results.push(value);
            return;
        }
        
        let parts: Vec<&str> = path.splitn(2, '.').collect();
        let current = parts[0];
        let rest = parts.get(1).map(|s| *s).unwrap_or("");
        
        match value {
            Value::Object(map) => {
                if current == "*" {
                    for val in map.values() {
                        self.query_internal(val, rest, results);
                    }
                } else if let Some(val) = map.get(current) {
                    self.query_internal(val, rest, results);
                }
            }
            Value::Array(arr) => {
                if current == "*" || current == "[]" {
                    for val in arr {
                        self.query_internal(val, rest, results);
                    }
                } else if let Ok(index) = current.parse::<usize>() {
                    if let Some(val) = arr.get(index) {
                        self.query_internal(val, rest, results);
                    }
                }
            }
            _ => {}
        }
    }
}

/// Serialize to JSON string
pub fn to_json<T: Serialize>(value: &T) -> crate::Result<String> {
    serde_json::to_string(value)
        .map_err(|e| crate::XRulesError::Serialization(e))
}

/// Deserialize from JSON string
pub fn from_json<T: DeserializeOwned>(json: &str) -> crate::Result<T> {
    serde_json::from_str(json)
        .map_err(|e| crate::XRulesError::Serialization(e))
}

/// Pretty print JSON
pub fn to_json_pretty<T: Serialize>(value: &T) -> crate::Result<String> {
    serde_json::to_string_pretty(value)
        .map_err(|e| crate::XRulesError::Serialization(e))
}

/// Check if a JSON value is "truthy"
pub fn is_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().map(|f| f != 0.0).unwrap_or(false),
        Value::String(s) => !s.is_empty(),
        Value::Array(a) => !a.is_empty(),
        Value::Object(o) => !o.is_empty(),
    }
}

/// Coerce value to string
pub fn coerce_string(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => s.clone(),
        Value::Array(a) => a.iter().map(coerce_string).collect::<Vec<_>>().join(","),
        Value::Object(_) => value.to_string(),
    }
}

/// Coerce value to number
pub fn coerce_number(value: &Value) -> Option<f64> {
    match value {
        Value::Null => Some(0.0),
        Value::Bool(b) => Some(if *b { 1.0 } else { 0.0 }),
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.parse().ok(),
        _ => None,
    }
}

/// Coerce value to boolean
pub fn coerce_bool(value: &Value) -> bool {
    is_truthy(value)
}
