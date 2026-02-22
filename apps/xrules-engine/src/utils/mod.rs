pub mod crypto;
pub mod json;

pub use crypto::{Encryption, HmacSigner};
pub use json::{JsonExt, JsonPath};

use serde_json::Value;
use std::collections::HashMap;

/// Generate a unique ID
pub fn generate_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Generate a short ID (first 8 chars of UUID)
pub fn generate_short_id() -> String {
    uuid::Uuid::new_v4().to_string()[..8].to_string()
}

/// Get current timestamp in milliseconds
pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// Format duration in human-readable format
pub fn format_duration_ms(ms: i64) -> String {
    if ms < 1000 {
        format!("{}ms", ms)
    } else if ms < 60000 {
        format!("{:.2}s", ms as f64 / 1000.0)
    } else {
        format!("{:.2}m", ms as f64 / 60000.0)
    }
}

/// Sanitize a string for use as a filename
pub fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

/// Truncate a string to a maximum length
pub fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len])
    }
}

/// Parse a variable path (e.g., "user.profile.name")
pub fn parse_path(path: &str) -> Vec<&str> {
    path.split('.').collect()
}

/// Get value at path from JSON
pub fn get_value_at_path(value: &Value, path: &str) -> Option<&Value> {
    let parts = parse_path(path);
    let mut current = value;
    
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

/// Set value at path in JSON (creates intermediate objects if needed)
pub fn set_value_at_path(value: &mut Value, path: &str, new_value: Value) -> Result<(), String> {
    let parts = parse_path(path);
    
    if parts.is_empty() {
        return Err("Empty path".to_string());
    }
    
    let mut current = value;
    
    for (i, part) in parts.iter().enumerate() {
        if i == parts.len() - 1 {
            // Last part - set the value
            match current {
                Value::Object(map) => {
                    map.insert(part.to_string(), new_value);
                    return Ok(());
                }
                _ => return Err("Cannot set value on non-object".to_string()),
            }
        }
        
        // Navigate or create intermediate objects
        match current {
            Value::Object(map) => {
                if !map.contains_key(*part) {
                    map.insert(part.to_string(), Value::Object(serde_json::Map::new()));
                }
                current = map.get_mut(*part).unwrap();
            }
            _ => return Err("Cannot navigate through non-object".to_string()),
        }
    }
    
    Ok(())
}

/// Merge two JSON objects
pub fn merge_json(base: &mut Value, other: Value) {
    match (base, other) {
        (Value::Object(base_map), Value::Object(other_map)) => {
            for (key, value) in other_map {
                if let Some(base_value) = base_map.get_mut(&key) {
                    merge_json(base_value, value);
                } else {
                    base_map.insert(key, value);
                }
            }
        }
        (base, other) => *base = other,
    }
}

/// Convert a flat HashMap with dot notation keys to nested JSON
pub fn flatten_to_nested(flat: &HashMap<String, Value>) -> Value {
    let mut result = Value::Object(serde_json::Map::new());
    
    for (key, value) in flat {
        let _ = set_value_at_path(&mut result, key, value.clone());
    }
    
    result
}

/// Convert nested JSON to a flat HashMap with dot notation keys
pub fn nested_to_flat(value: &Value, prefix: &str) -> HashMap<String, Value> {
    let mut result = HashMap::new();
    
    match value {
        Value::Object(map) => {
            for (key, val) in map {
                let new_key = if prefix.is_empty() {
                    key.clone()
                } else {
                    format!("{}.{}", prefix, key)
                };
                result.extend(nested_to_flat(val, &new_key));
            }
        }
        Value::Array(arr) => {
            for (i, val) in arr.iter().enumerate() {
                let new_key = format!("{}[{}]", prefix, i);
                result.extend(nested_to_flat(val, &new_key));
            }
        }
        _ => {
            result.insert(prefix.to_string(), value.clone());
        }
    }
    
    result
}
