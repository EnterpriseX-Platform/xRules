use serde::{Deserialize, Serialize};
use super::Position;

/// Node in a flow
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: NodeType,
    pub position: Position,
    #[serde(default)]
    pub data: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

impl Node {
    pub fn new(id: impl Into<String>, node_type: NodeType) -> Self {
        Self {
            id: id.into(),
            node_type,
            position: Position::default(),
            data: serde_json::Value::Object(serde_json::Map::new()),
            label: None,
        }
    }
    
    pub fn with_position(mut self, x: f64, y: f64) -> Self {
        self.position = Position { x, y };
        self
    }
    
    pub fn with_data(mut self, data: serde_json::Value) -> Self {
        self.data = data;
        self
    }
    
    /// Validate the node configuration
    pub fn validate(&self) -> Result<(), String> {
        if self.id.is_empty() {
            return Err("Node ID cannot be empty".to_string());
        }
        
        match self.node_type {
            NodeType::Database => self.validate_database_node(),
            NodeType::HttpRequest => self.validate_http_node(),
            NodeType::Condition => self.validate_condition_node(),
            NodeType::Transform => self.validate_transform_node(),
            NodeType::Sftp => self.validate_sftp_node(),
            NodeType::ApiOutput => self.validate_api_output_node(),
            _ => Ok(()),
        }
    }
    
    fn validate_database_node(&self) -> Result<(), String> {
        let connection = self.data.get("connection")
            .and_then(|v| v.as_str())
            .ok_or("Database node must have a 'connection' field")?;
        
        if connection.is_empty() {
            return Err("Database connection cannot be empty".to_string());
        }
        
        let query = self.data.get("query")
            .and_then(|v| v.as_str())
            .ok_or("Database node must have a 'query' field")?;
        
        if query.is_empty() {
            return Err("Database query cannot be empty".to_string());
        }
        
        Ok(())
    }
    
    fn validate_http_node(&self) -> Result<(), String> {
        let url = self.data.get("url")
            .and_then(|v| v.as_str())
            .ok_or("HTTP node must have a 'url' field")?;
        
        if url.is_empty() {
            return Err("HTTP URL cannot be empty".to_string());
        }
        
        // Validate URL format
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return Err("HTTP URL must start with http:// or https://".to_string());
        }
        
        Ok(())
    }
    
    fn validate_condition_node(&self) -> Result<(), String> {
        let condition = self.data.get("condition")
            .and_then(|v| v.as_str())
            .ok_or("Condition node must have a 'condition' field")?;
        
        if condition.is_empty() {
            return Err("Condition expression cannot be empty".to_string());
        }
        
        Ok(())
    }
    
    fn validate_transform_node(&self) -> Result<(), String> {
        let transform = self.data.get("transform")
            .and_then(|v| v.as_str())
            .or_else(|| self.data.get("template").and_then(|v| v.as_str()))
            .ok_or("Transform node must have a 'transform' or 'template' field")?;
        
        if transform.is_empty() {
            return Err("Transform cannot be empty".to_string());
        }
        
        Ok(())
    }
    
    fn validate_sftp_node(&self) -> Result<(), String> {
        let connection = self.data.get("connection")
            .and_then(|v| v.as_str())
            .ok_or("SFTP node must have a 'connection' field")?;
        
        if connection.is_empty() {
            return Err("SFTP connection cannot be empty".to_string());
        }
        
        let action = self.data.get("action")
            .and_then(|v| v.as_str())
            .ok_or("SFTP node must have an 'action' field (upload/download/list)")?;
        
        if !["upload", "download", "list", "delete"].contains(&action) {
            return Err("SFTP action must be one of: upload, download, list, delete".to_string());
        }
        
        Ok(())
    }
    
    fn validate_api_output_node(&self) -> Result<(), String> {
        // API output node is optional - can just pass through
        Ok(())
    }
    
    /// Check if this node is a trigger node
    pub fn is_trigger(&self) -> bool {
        matches!(
            self.node_type,
            NodeType::ApiInput | NodeType::ScheduleTrigger | NodeType::BasketTrigger
        )
    }
    
    /// Check if this node is an aggregation node
    pub fn is_aggregation(&self) -> bool {
        matches!(self.node_type, NodeType::AggregateSplit | NodeType::AggregateJoin)
    }
}

/// Types of nodes supported
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeType {
    ApiInput,
    ApiOutput,
    Database,
    HttpRequest,
    Condition,
    Transform,
    Sftp,
    Delay,
    AggregateSplit,
    AggregateJoin,
    ScheduleTrigger,
    BasketTrigger,
    FileRead,
    FileWrite,
    Log,
    Error,
}

impl NodeType {
    pub fn as_str(&self) -> &'static str {
        match self {
            NodeType::ApiInput => "api_input",
            NodeType::ApiOutput => "api_output",
            NodeType::Database => "database",
            NodeType::HttpRequest => "http_request",
            NodeType::Condition => "condition",
            NodeType::Transform => "transform",
            NodeType::Sftp => "sftp",
            NodeType::Delay => "delay",
            NodeType::AggregateSplit => "aggregate_split",
            NodeType::AggregateJoin => "aggregate_join",
            NodeType::ScheduleTrigger => "schedule_trigger",
            NodeType::BasketTrigger => "basket_trigger",
            NodeType::FileRead => "file_read",
            NodeType::FileWrite => "file_write",
            NodeType::Log => "log",
            NodeType::Error => "error",
        }
    }
    
    /// Check if this node type is synchronous (no external I/O)
    pub fn is_synchronous(&self) -> bool {
        matches!(
            self,
            NodeType::Condition | NodeType::Transform | NodeType::Delay | NodeType::Log | NodeType::Error
        )
    }
    
    /// Check if this node type requires database connection
    pub fn requires_db(&self) -> bool {
        matches!(self, NodeType::Database)
    }
    
    /// Check if this node type requires HTTP client
    pub fn requires_http(&self) -> bool {
        matches!(self, NodeType::HttpRequest)
    }
    
    /// Check if this node type requires SFTP connection
    pub fn requires_sftp(&self) -> bool {
        matches!(self, NodeType::Sftp)
    }
}

impl std::fmt::Display for NodeType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}
