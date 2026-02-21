use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Execution context holding runtime state
#[derive(Debug, Clone)]
pub struct ExecutionContext {
    pub execution_id: Uuid,
    pub flow_id: Uuid,
    pub project_id: Uuid,
    pub workspace_id: Option<Uuid>,
    pub variables: HashMap<String, serde_json::Value>,
    pub logs: Vec<ExecutionLog>,
    pub start_time: Option<chrono::DateTime<chrono::Utc>>,
    pub current_node_id: Option<String>,
    pub cancelled: bool,
    pub metadata: HashMap<String, String>,
}

impl ExecutionContext {
    pub fn new(
        execution_id: Uuid,
        flow_id: Uuid,
        project_id: Uuid,
        workspace_id: Option<Uuid>,
    ) -> Self {
        Self {
            execution_id,
            flow_id,
            project_id,
            workspace_id,
            variables: HashMap::new(),
            logs: Vec::new(),
            start_time: Some(chrono::Utc::now()),
            current_node_id: None,
            cancelled: false,
            metadata: HashMap::new(),
        }
    }
    
    /// Set a variable in the context
    pub fn set_variable(&mut self, key: impl Into<String>, value: impl Into<serde_json::Value>) {
        self.variables.insert(key.into(), value.into());
    }
    
    /// Get a variable from the context
    pub fn get_variable(&self, key: &str) -> Option<&serde_json::Value> {
        self.variables.get(key)
    }
    
    /// Get a variable as string
    pub fn get_variable_string(&self, key: &str) -> Option<String> {
        self.get_variable(key)
            .and_then(|v| v.as_str().map(String::from))
            .or_else(|| self.get_variable(key).map(|v| v.to_string()))
    }
    
    /// Check if a variable exists
    pub fn has_variable(&self, key: &str) -> bool {
        self.variables.contains_key(key)
    }
    
    /// Merge input data into variables
    pub fn merge_input(&mut self, input: serde_json::Value) {
        if let serde_json::Value::Object(map) = input {
            for (key, value) in map {
                self.set_variable(key, value);
            }
        } else {
            self.set_variable("input", input);
        }
    }
    
    /// Add a log entry
    pub fn log(&mut self, node_id: impl Into<String>, level: LogLevel, message: impl Into<String>) {
        let log = ExecutionLog::new(self.execution_id, node_id, level, message);
        self.logs.push(log);
    }
    
    /// Log at info level
    pub fn log_info(&mut self, node_id: impl Into<String>, message: impl Into<String>) {
        self.log(node_id, LogLevel::Info, message);
    }
    
    /// Log at warning level
    pub fn log_warn(&mut self, node_id: impl Into<String>, message: impl Into<String>) {
        self.log(node_id, LogLevel::Warn, message);
    }
    
    /// Log at error level
    pub fn log_error(&mut self, node_id: impl Into<String>, message: impl Into<String>) {
        self.log(node_id, LogLevel::Error, message);
    }
    
    /// Log at debug level
    pub fn log_debug(&mut self, node_id: impl Into<String>, message: impl Into<String>) {
        self.log(node_id, LogLevel::Debug, message);
    }
    
    /// Mark execution as cancelled
    pub fn cancel(&mut self) {
        self.cancelled = true;
    }
    
    /// Check if execution is cancelled
    pub fn is_cancelled(&self) -> bool {
        self.cancelled
    }
    
    /// Get execution duration in milliseconds
    pub fn duration_ms(&self) -> Option<i64> {
        self.start_time.map(|start| {
            let now = chrono::Utc::now();
            now.signed_duration_since(start).num_milliseconds()
        })
    }
    
    /// Get the full execution output as JSON
    pub fn to_output(&self) -> serde_json::Value {
        let variables = serde_json::to_value(&self.variables).unwrap_or_default();
        serde_json::json!({
            "execution_id": self.execution_id,
            "variables": variables,
            "metadata": self.metadata,
        })
    }
    
    /// Create a nested context for parallel execution
    pub fn fork(&self, suffix: &str) -> Self {
        let mut forked = Self::new(
            Uuid::new_v4(),
            self.flow_id,
            self.project_id,
            self.workspace_id,
        );
        forked.variables = self.variables.clone();
        forked.metadata = self.metadata.clone();
        forked.metadata.insert("parent_execution_id".to_string(), self.execution_id.to_string());
        forked.metadata.insert("fork_suffix".to_string(), suffix.to_string());
        forked
    }
}

/// Execution log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionLog {
    pub id: Option<Uuid>,
    pub execution_id: Uuid,
    pub node_id: String,
    pub level: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl ExecutionLog {
    pub fn new(
        execution_id: Uuid,
        node_id: impl Into<String>,
        level: LogLevel,
        message: impl Into<String>,
    ) -> Self {
        Self {
            id: Some(Uuid::new_v4()),
            execution_id,
            node_id: node_id.into(),
            level: level.to_string(),
            message: message.into(),
            metadata: None,
            created_at: chrono::Utc::now(),
        }
    }
    
    pub fn with_metadata(mut self, metadata: serde_json::Value) -> Self {
        self.metadata = Some(metadata);
        self
    }
}

/// Log level
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

impl std::fmt::Display for LogLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LogLevel::Debug => write!(f, "DEBUG"),
            LogLevel::Info => write!(f, "INFO"),
            LogLevel::Warn => write!(f, "WARN"),
            LogLevel::Error => write!(f, "ERROR"),
        }
    }
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

/// Execution record for persistence
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionRecord {
    pub id: Uuid,
    pub flow_id: Uuid,
    pub project_id: Uuid,
    pub workspace_id: Option<Uuid>,
    pub status: ExecutionStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variables: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

impl ExecutionRecord {
    pub fn new(flow_id: Uuid, project_id: Uuid) -> Self {
        Self {
            id: Uuid::new_v4(),
            flow_id,
            project_id,
            workspace_id: None,
            status: ExecutionStatus::Pending,
            input_data: None,
            output_data: None,
            variables: None,
            error_message: None,
            started_at: None,
            completed_at: None,
            duration_ms: None,
            created_at: Some(chrono::Utc::now()),
            updated_at: Some(chrono::Utc::now()),
            metadata: None,
        }
    }
    
    pub fn start(&mut self) {
        self.status = ExecutionStatus::Running;
        self.started_at = Some(chrono::Utc::now());
        self.updated_at = Some(chrono::Utc::now());
    }
    
    pub fn complete(&mut self, output: Option<serde_json::Value>) {
        self.status = ExecutionStatus::Completed;
        self.output_data = output;
        self.completed_at = Some(chrono::Utc::now());
        self.updated_at = Some(chrono::Utc::now());
        self.calculate_duration();
    }
    
    pub fn fail(&mut self, error: impl Into<String>) {
        self.status = ExecutionStatus::Failed;
        self.error_message = Some(error.into());
        self.completed_at = Some(chrono::Utc::now());
        self.updated_at = Some(chrono::Utc::now());
        self.calculate_duration();
    }
    
    pub fn cancel(&mut self) {
        self.status = ExecutionStatus::Cancelled;
        self.completed_at = Some(chrono::Utc::now());
        self.updated_at = Some(chrono::Utc::now());
        self.calculate_duration();
    }
    
    pub fn timeout(&mut self) {
        self.status = ExecutionStatus::Timeout;
        self.completed_at = Some(chrono::Utc::now());
        self.updated_at = Some(chrono::Utc::now());
        self.calculate_duration();
    }
    
    fn calculate_duration(&mut self) {
        if let (Some(started), Some(completed)) = (self.started_at, self.completed_at) {
            self.duration_ms = Some(completed.signed_duration_since(started).num_milliseconds());
        }
    }
}

/// Execution statistics
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ExecutionStats {
    pub total_executions: u64,
    pub successful_executions: u64,
    pub failed_executions: u64,
    pub cancelled_executions: u64,
    pub average_duration_ms: f64,
    pub min_duration_ms: i64,
    pub max_duration_ms: i64,
}

impl ExecutionStats {
    pub fn record_execution(&mut self, status: ExecutionStatus, duration_ms: i64) {
        self.total_executions += 1;
        
        match status {
            ExecutionStatus::Completed => self.successful_executions += 1,
            ExecutionStatus::Failed => self.failed_executions += 1,
            ExecutionStatus::Cancelled => self.cancelled_executions += 1,
            _ => {}
        }
        
        // Update average
        let total = self.total_executions as f64;
        self.average_duration_ms = 
            ((self.average_duration_ms * (total - 1.0)) + duration_ms as f64) / total;
        
        // Update min/max
        if self.min_duration_ms == 0 || duration_ms < self.min_duration_ms {
            self.min_duration_ms = duration_ms;
        }
        if duration_ms > self.max_duration_ms {
            self.max_duration_ms = duration_ms;
        }
    }
    
    pub fn success_rate(&self) -> f64 {
        if self.total_executions == 0 {
            return 0.0;
        }
        self.successful_executions as f64 / self.total_executions as f64 * 100.0
    }
}
