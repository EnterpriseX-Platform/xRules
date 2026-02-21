pub mod connection;
pub mod execution;
pub mod flow;
pub mod node;

pub use connection::*;
pub use execution::*;
pub use flow::*;
pub use node::*;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Common position struct for nodes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

impl Default for Position {
    fn default() -> Self {
        Self { x: 0.0, y: 0.0 }
    }
}

/// Edge connecting two nodes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Edge {
    pub id: String,
    pub source: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_handle: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_handle: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// Variable types in execution context
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum VariableValue {
    String(String),
    Number(f64),
    Boolean(bool),
    Array(Vec<VariableValue>),
    Object(HashMap<String, VariableValue>),
    Null,
}

impl From<VariableValue> for serde_json::Value {
    fn from(v: VariableValue) -> Self {
        match v {
            VariableValue::String(s) => serde_json::Value::String(s),
            VariableValue::Number(n) => serde_json::json!(n),
            VariableValue::Boolean(b) => serde_json::Value::Bool(b),
            VariableValue::Array(arr) => {
                serde_json::Value::Array(arr.into_iter().map(Into::into).collect())
            }
            VariableValue::Object(obj) => {
                serde_json::Value::Object(obj.into_iter().map(|(k, v)| (k, v.into())).collect())
            }
            VariableValue::Null => serde_json::Value::Null,
        }
    }
}

impl From<serde_json::Value> for VariableValue {
    fn from(v: serde_json::Value) -> Self {
        match v {
            serde_json::Value::String(s) => VariableValue::String(s),
            serde_json::Value::Number(n) => VariableValue::Number(n.as_f64().unwrap_or(0.0)),
            serde_json::Value::Bool(b) => VariableValue::Boolean(b),
            serde_json::Value::Array(arr) => {
                VariableValue::Array(arr.into_iter().map(Into::into).collect())
            }
            serde_json::Value::Object(obj) => {
                VariableValue::Object(obj.into_iter().map(|(k, v)| (k, v.into())).collect())
            }
            serde_json::Value::Null => VariableValue::Null,
        }
    }
}

/// Node output containing data and next nodes
#[derive(Debug, Clone)]
pub struct NodeOutput {
    pub data: serde_json::Value,
    pub next_nodes: Vec<String>,
}

impl NodeOutput {
    pub fn new(data: serde_json::Value) -> Self {
        Self {
            data,
            next_nodes: Vec::new(),
        }
    }
    
    pub fn with_next_nodes(mut self, nodes: Vec<String>) -> Self {
        self.next_nodes = nodes;
        self
    }
}

/// Execution error types
#[derive(Debug, Clone, thiserror::Error)]
pub enum ExecutionError {
    #[error("Node execution failed: {message}")]
    NodeError { node_id: String, message: String },
    
    #[error("Connection error: {message}")]
    ConnectionError { message: String },
    
    #[error("Validation error: {message}")]
    ValidationError { message: String },
    
    #[error("Timeout error: {message}")]
    TimeoutError { message: String },
    
    #[error("Execution cancelled: {message}")]
    CancelledError { message: String },
    
    #[error("External service error: {message}")]
    ExternalError { message: String },
    
    #[error("Transform error: {message}")]
    TransformError { message: String },
    
    #[error("Condition error: {message}")]
    ConditionError { message: String },
}

impl ExecutionError {
    pub fn node_error(node_id: impl Into<String>, message: impl Into<String>) -> Self {
        Self::NodeError {
            node_id: node_id.into(),
            message: message.into(),
        }
    }
    
    pub fn connection_error(message: impl Into<String>) -> Self {
        Self::ConnectionError {
            message: message.into(),
        }
    }
    
    pub fn validation_error(message: impl Into<String>) -> Self {
        Self::ValidationError {
            message: message.into(),
        }
    }
    
    pub fn timeout_error(message: impl Into<String>) -> Self {
        Self::TimeoutError {
            message: message.into(),
        }
    }
    
    pub fn cancelled_error(message: impl Into<String>) -> Self {
        Self::CancelledError {
            message: message.into(),
        }
    }
    
    pub fn external_error(message: impl Into<String>) -> Self {
        Self::ExternalError {
            message: message.into(),
        }
    }
    
    pub fn transform_error(message: impl Into<String>) -> Self {
        Self::TransformError {
            message: message.into(),
        }
    }
    
    pub fn condition_error(message: impl Into<String>) -> Self {
        Self::ConditionError {
            message: message.into(),
        }
    }
}
