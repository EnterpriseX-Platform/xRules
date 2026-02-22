use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{Edge, Node, Position};

/// Flow definition representing a complete workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Flow {
    pub id: Uuid,
    pub project_id: Uuid,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<Uuid>,
    pub name: String,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    pub version: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl Flow {
    pub fn new(id: Uuid, project_id: Uuid, name: impl Into<String>) -> Self {
        Self {
            id,
            project_id,
            workspace_id: None,
            name: name.into(),
            nodes: Vec::new(),
            edges: Vec::new(),
            version: 1,
            status: Some("active".to_string()),
            description: None,
            created_at: None,
            updated_at: None,
        }
    }
    
    /// Get the start node (API input or trigger node)
    pub fn get_start_node(&self) -> Option<&Node> {
        self.nodes.iter().find(|n| {
            matches!(
                n.node_type,
                super::NodeType::ApiInput | super::NodeType::ScheduleTrigger | super::NodeType::BasketTrigger
            )
        })
    }
    
    /// Get outgoing edges from a node
    pub fn get_outgoing_edges(&self, node_id: &str) -> Vec<&Edge> {
        self.edges.iter().filter(|e| e.source == node_id).collect()
    }
    
    /// Get incoming edges to a node
    pub fn get_incoming_edges(&self, node_id: &str) -> Vec<&Edge> {
        self.edges.iter().filter(|e| e.target == node_id).collect()
    }
    
    /// Get node by ID
    pub fn get_node(&self, node_id: &str) -> Option<&Node> {
        self.nodes.iter().find(|n| n.id == node_id)
    }
    
    /// Get next nodes from a given node
    pub fn get_next_nodes(&self, node_id: &str) -> Vec<&Node> {
        self.get_outgoing_edges(node_id)
            .iter()
            .filter_map(|e| self.get_node(&e.target))
            .collect()
    }
    
    /// Validate the flow structure
    pub fn validate(&self) -> Vec<FlowValidationError> {
        let mut errors = Vec::new();
        
        // Check for start node
        if self.get_start_node().is_none() {
            errors.push(FlowValidationError {
                node_id: None,
                field: None,
                message: "Flow must have at least one start node (ApiInput, ScheduleTrigger, or BasketTrigger)".to_string(),
            });
        }
        
        // Check for orphaned nodes
        let node_ids: std::collections::HashSet<_> = self.nodes.iter().map(|n| &n.id).collect();
        for edge in &self.edges {
            if !node_ids.contains(&edge.source) {
                errors.push(FlowValidationError {
                    node_id: Some(edge.source.clone()),
                    field: Some("source".to_string()),
                    message: format!("Edge references non-existent source node: {}", edge.source),
                });
            }
            if !node_ids.contains(&edge.target) {
                errors.push(FlowValidationError {
                    node_id: Some(edge.target.clone()),
                    field: Some("target".to_string()),
                    message: format!("Edge references non-existent target node: {}", edge.target),
                });
            }
        }
        
        // Check for duplicate node IDs
        let mut seen_ids = std::collections::HashSet::new();
        for node in &self.nodes {
            if !seen_ids.insert(&node.id) {
                errors.push(FlowValidationError {
                    node_id: Some(node.id.clone()),
                    field: Some("id".to_string()),
                    message: format!("Duplicate node ID: {}", node.id),
                });
            }
        }
        
        // Validate individual nodes
        for node in &self.nodes {
            if let Err(e) = node.validate() {
                errors.push(FlowValidationError {
                    node_id: Some(node.id.clone()),
                    field: None,
                    message: e,
                });
            }
        }
        
        errors
    }
    
    /// Check if flow is valid
    pub fn is_valid(&self) -> bool {
        self.validate().is_empty()
    }
}

/// Flow validation error
#[derive(Debug, Clone)]
pub struct FlowValidationError {
    pub node_id: Option<String>,
    pub field: Option<String>,
    pub message: String,
}

/// Flow execution request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowExecutionRequest {
    pub flow_id: Uuid,
    pub project_id: Uuid,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variables: Option<std::collections::HashMap<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<std::collections::HashMap<String, String>>,
}

/// Flow execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowExecutionResult {
    pub execution_id: Uuid,
    pub flow_id: Uuid,
    pub status: ExecutionStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<i64>,
}

/// Execution status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ExecutionStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
    Timeout,
}

impl ExecutionStatus {
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            ExecutionStatus::Completed | ExecutionStatus::Failed | ExecutionStatus::Cancelled | ExecutionStatus::Timeout
        )
    }
    
    pub fn is_running(&self) -> bool {
        matches!(self, ExecutionStatus::Running)
    }
}

impl std::fmt::Display for ExecutionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ExecutionStatus::Pending => write!(f, "PENDING"),
            ExecutionStatus::Running => write!(f, "RUNNING"),
            ExecutionStatus::Completed => write!(f, "COMPLETED"),
            ExecutionStatus::Failed => write!(f, "FAILED"),
            ExecutionStatus::Cancelled => write!(f, "CANCELLED"),
            ExecutionStatus::Timeout => write!(f, "TIMEOUT"),
        }
    }
}
