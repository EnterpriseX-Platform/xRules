package execution

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Status represents execution status
type Status string

const (
	StatusPending    Status = "pending"
	StatusRunning    Status = "running"
	StatusCompleted  Status = "completed"
	StatusFailed     Status = "failed"
	StatusCancelled  Status = "cancelled"
	StatusTimeout    Status = "timeout"
)

// Execution represents a rules project execution
type Execution struct {
	ID             uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	RulesProjectID uuid.UUID      `gorm:"type:uuid;not null;index" json:"rules_project_id"`
	Status         Status         `gorm:"not null;default:'pending'" json:"status"`
	Input          Input          `gorm:"type:jsonb" json:"input"`
	Output         Output         `gorm:"type:jsonb" json:"output"`
	Context        Context        `gorm:"type:jsonb" json:"context"`
	NodeResults    NodeResults    `gorm:"type:jsonb" json:"node_results"`
	StartedAt      *time.Time     `json:"started_at,omitempty"`
	EndedAt        *time.Time     `json:"ended_at,omitempty"`
	Duration       int            `json:"duration"` // milliseconds
	Error          string         `json:"error,omitempty"`
	CreatedBy      uuid.UUID      `gorm:"type:uuid" json:"created_by,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`

	// Relationships
	RulesProject interface{} `gorm:"-" json:"rules_project,omitempty"`
	Logs         []Log       `json:"logs,omitempty"`
}

// Input represents execution input data
type Input map[string]interface{}

// Output represents execution output data
type Output map[string]interface{}

// Context represents execution context
type Context struct {
	Environment   map[string]string      `json:"environment,omitempty"`
	Variables     map[string]interface{} `json:"variables,omitempty"`
	ConnectionIDs map[string]uuid.UUID   `json:"connection_ids,omitempty"`
}

// NodeResult represents the result of a single node execution
type NodeResult struct {
	NodeID    string                 `json:"node_id"`
	NodeType  string                 `json:"node_type"`
	Status    string                 `json:"status"` // success, error, skipped
	Input     map[string]interface{} `json:"input,omitempty"`
	Output    map[string]interface{} `json:"output,omitempty"`
	Error     string                 `json:"error,omitempty"`
	StartedAt time.Time              `json:"started_at"`
	EndedAt   time.Time              `json:"ended_at,omitempty"`
	Duration  int                    `json:"duration"` // milliseconds
}

// NodeResults is a map of node ID to result
type NodeResults map[string]NodeResult

// Log represents an execution log entry
type Log struct {
	ID          uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	ExecutionID uuid.UUID `gorm:"type:uuid;not null;index" json:"execution_id"`
	Level       LogLevel  `gorm:"not null" json:"level"`
	NodeID      string    `json:"node_id,omitempty"`
	Message     string    `gorm:"not null" json:"message"`
	Data        LogData   `gorm:"type:jsonb" json:"data,omitempty"`
	Timestamp   time.Time `gorm:"not null;default:now()" json:"timestamp"`
}

// LogLevel represents log level
type LogLevel string

const (
	LogLevelDebug   LogLevel = "debug"
	LogLevelInfo    LogLevel = "info"
	LogLevelWarning LogLevel = "warning"
	LogLevelError   LogLevel = "error"
)

// LogData contains additional log information
type LogData map[string]interface{}

// TableName returns the table name
func (Execution) TableName() string {
	return "executions"
}

// TableName returns the table name
func (Log) TableName() string {
	return "execution_logs"
}

// BeforeCreate hook
func (e *Execution) BeforeCreate(tx *gorm.DB) error {
	if e.ID == uuid.Nil {
		e.ID = uuid.New()
	}
	if e.NodeResults == nil {
		e.NodeResults = NodeResults{}
	}
	return nil
}

// Start marks the execution as started
func (e *Execution) Start() {
	now := time.Now()
	e.StartedAt = &now
	e.Status = StatusRunning
}

// Complete marks the execution as completed
func (e *Execution) Complete(output Output) {
	now := time.Now()
	e.EndedAt = &now
	e.Status = StatusCompleted
	e.Output = output
	if e.StartedAt != nil {
		e.Duration = int(now.Sub(*e.StartedAt).Milliseconds())
	}
}

// Fail marks the execution as failed
func (e *Execution) Fail(err error) {
	now := time.Now()
	e.EndedAt = &now
	e.Status = StatusFailed
	if err != nil {
		e.Error = err.Error()
	}
	if e.StartedAt != nil {
		e.Duration = int(now.Sub(*e.StartedAt).Milliseconds())
	}
}

// Cancel marks the execution as cancelled
func (e *Execution) Cancel() {
	now := time.Now()
	e.EndedAt = &now
	e.Status = StatusCancelled
	if e.StartedAt != nil {
		e.Duration = int(now.Sub(*e.StartedAt).Milliseconds())
	}
}

// IsActive returns true if execution is still running
func (e *Execution) IsActive() bool {
	return e.Status == StatusPending || e.Status == StatusRunning
}

// AddNodeResult adds a node execution result
func (e *Execution) AddNodeResult(result NodeResult) {
	if e.NodeResults == nil {
		e.NodeResults = NodeResults{}
	}
	e.NodeResults[result.NodeID] = result
}

// DTOs

type CreateExecutionRequest struct {
	RulesProjectID uuid.UUID         `json:"rules_project_id" validate:"required,uuid"`
	Input          Input             `json:"input,omitempty"`
	Context        Context           `json:"context,omitempty"`
}

type ExecutionResponse struct {
	ID             uuid.UUID   `json:"id"`
	RulesProjectID uuid.UUID   `json:"rules_project_id"`
	Status         Status      `json:"status"`
	Input          Input       `json:"input,omitempty"`
	Output         Output      `json:"output,omitempty"`
	Context        Context     `json:"context,omitempty"`
	NodeResults    NodeResults `json:"node_results,omitempty"`
	StartedAt      *time.Time  `json:"started_at,omitempty"`
	EndedAt        *time.Time  `json:"ended_at,omitempty"`
	Duration       int         `json:"duration"`
	Error          string      `json:"error,omitempty"`
	CreatedBy      uuid.UUID   `json:"created_by,omitempty"`
	CreatedAt      time.Time   `json:"created_at"`
	UpdatedAt      time.Time   `json:"updated_at"`
	
	// Aggregated fields
	LogCount int   `json:"log_count,omitempty"`
	Logs     []Log `json:"logs,omitempty"`
}

func (e *Execution) ToResponse() *ExecutionResponse {
	return &ExecutionResponse{
		ID:             e.ID,
		RulesProjectID: e.RulesProjectID,
		Status:         e.Status,
		Input:          e.Input,
		Output:         e.Output,
		Context:        e.Context,
		NodeResults:    e.NodeResults,
		StartedAt:      e.StartedAt,
		EndedAt:        e.EndedAt,
		Duration:       e.Duration,
		Error:          e.Error,
		CreatedBy:      e.CreatedBy,
		CreatedAt:      e.CreatedAt,
		UpdatedAt:      e.UpdatedAt,
	}
}

// ListExecutionsRequest for filtering and pagination
type ListExecutionsRequest struct {
	RulesProjectID string `form:"rules_project_id,omitempty" validate:"omitempty,uuid"`
	Status         string `form:"status,omitempty" validate:"omitempty,oneof=pending running completed failed cancelled timeout"`
	FromDate       string `form:"from_date,omitempty"`
	ToDate         string `form:"to_date,omitempty"`
	Page           int    `form:"page,default=1" validate:"min=1"`
	Limit          int    `form:"limit,default=20" validate:"min=1,max=100"`
}

// ListExecutionsResponse for paginated results
type ListExecutionsResponse struct {
	Data       []*ExecutionResponse `json:"data"`
	Total      int64                `json:"total"`
	Page       int                  `json:"page"`
	Limit      int                  `json:"limit"`
	TotalPages int                  `json:"total_pages"`
}

// LogResponse represents a log entry response
type LogResponse struct {
	ID        uuid.UUID `json:"id"`
	Level     LogLevel  `json:"level"`
	NodeID    string    `json:"node_id,omitempty"`
	Message   string    `json:"message"`
	Data      LogData   `json:"data,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

func (l *Log) ToResponse() *LogResponse {
	return &LogResponse{
		ID:        l.ID,
		Level:     l.Level,
		NodeID:    l.NodeID,
		Message:   l.Message,
		Data:      l.Data,
		Timestamp: l.Timestamp,
	}
}

// ExecutionStats represents execution statistics
type ExecutionStats struct {
	TotalCount    int64            `json:"total_count"`
	StatusCounts  map[Status]int64 `json:"status_counts"`
	AvgDuration   int              `json:"avg_duration"` // milliseconds
	SuccessRate   float64          `json:"success_rate"` // percentage
	PeriodStart   time.Time        `json:"period_start"`
	PeriodEnd     time.Time        `json:"period_end"`
}
