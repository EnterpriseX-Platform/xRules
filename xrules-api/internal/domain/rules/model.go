package rules

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Status represents rules project status
type Status string

const (
	StatusDraft     Status = "draft"
	StatusActive    Status = "active"
	StatusPaused    Status = "paused"
	StatusArchived  Status = "archived"
)

// RulesProject represents a rules/flow project
type RulesProject struct {
	ID          uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	ProjectID   uuid.UUID      `gorm:"type:uuid;not null;index" json:"project_id"`
	Name        string         `gorm:"not null;size:255" json:"name"`
	Description string         `json:"description,omitempty"`
	Nodes       Nodes          `gorm:"type:jsonb;default:'[]'" json:"nodes"`
	Edges       Edges          `gorm:"type:jsonb;default:'[]'" json:"edges"`
	Version     int            `gorm:"not null;default:1" json:"version"`
	Status      Status         `gorm:"not null;default:'draft'" json:"status"`
	Settings    RulesSettings  `gorm:"type:jsonb;default:'{}'" json:"settings"`
	CreatedBy   uuid.UUID      `gorm:"type:uuid;not null" json:"created_by"`
	UpdatedBy   uuid.UUID      `gorm:"type:uuid" json:"updated_by,omitempty"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`

	// Relationships
	Project   interface{} `gorm:"-" json:"project,omitempty"`
	Executions interface{} `gorm:"-" json:"executions,omitempty"`
}

// Node represents a node in the flow
type Node struct {
	ID       string                 `json:"id"`
	Type     string                 `json:"type"`
	Label    string                 `json:"label"`
	Position Position               `json:"position"`
	Data     map[string]interface{} `json:"data"`
}

// Nodes is a slice of Node
type Nodes []Node

// Edge represents a connection between nodes
type Edge struct {
	ID       string `json:"id"`
	Source   string `json:"source"`
	Target   string `json:"target"`
	Label    string `json:"label,omitempty"`
	Animated bool   `json:"animated,omitempty"`
}

// Edges is a slice of Edge
type Edges []Edge

// Position represents node position
type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// RulesSettings contains rules project configuration
type RulesSettings struct {
	Timeout         int               `json:"timeout"`          // execution timeout in seconds
	MaxRetries      int               `json:"max_retries"`
	RetryDelay      int               `json:"retry_delay"`      // delay between retries in seconds
	Parallelism     int               `json:"parallelism"`      // max parallel node executions
	EnvironmentVars map[string]string `json:"environment_vars"`
}

// TableName returns the table name
func (RulesProject) TableName() string {
	return "rules_projects"
}

// BeforeCreate hook
func (rp *RulesProject) BeforeCreate(tx *gorm.DB) error {
	if rp.ID == uuid.Nil {
		rp.ID = uuid.New()
	}
	if rp.Nodes == nil {
		rp.Nodes = Nodes{}
	}
	if rp.Edges == nil {
		rp.Edges = Edges{}
	}
	return nil
}

// BeforeUpdate hook - increment version on update
func (rp *RulesProject) BeforeUpdate(tx *gorm.DB) error {
	rp.Version++
	return nil
}

// IncrementVersion manually increments the version
func (rp *RulesProject) IncrementVersion() {
	rp.Version++
}

// DTOs

type CreateRulesProjectRequest struct {
	Name        string        `json:"name" validate:"required,max:255"`
	Description string        `json:"description,omitempty"`
	Nodes       Nodes         `json:"nodes,omitempty"`
	Edges       Edges         `json:"edges,omitempty"`
	Settings    RulesSettings `json:"settings,omitempty"`
}

type UpdateRulesProjectRequest struct {
	Name        string        `json:"name,omitempty" validate:"omitempty,max:255"`
	Description string        `json:"description,omitempty"`
	Nodes       *Nodes        `json:"nodes,omitempty"`
	Edges       *Edges        `json:"edges,omitempty"`
	Status      *Status       `json:"status,omitempty" validate:"omitempty,oneof=draft active paused archived"`
	Settings    RulesSettings `json:"settings,omitempty"`
}

type ExecuteRulesRequest struct {
	Input       map[string]interface{} `json:"input,omitempty"`
	Environment map[string]string      `json:"environment,omitempty"`
	Async       bool                   `json:"async,omitempty"`
}

type RulesProjectResponse struct {
	ID          uuid.UUID     `json:"id"`
	ProjectID   uuid.UUID     `json:"project_id"`
	Name        string        `json:"name"`
	Description string        `json:"description,omitempty"`
	Nodes       Nodes         `json:"nodes"`
	Edges       Edges         `json:"edges"`
	Version     int           `json:"version"`
	Status      Status        `json:"status"`
	Settings    RulesSettings `json:"settings"`
	CreatedBy   uuid.UUID     `json:"created_by"`
	UpdatedBy   uuid.UUID     `json:"updated_by,omitempty"`
	CreatedAt   time.Time     `json:"created_at"`
	UpdatedAt   time.Time     `json:"updated_at"`
	
	// Aggregated fields
	ExecutionCount   int64       `json:"execution_count,omitempty"`
	LastExecutionAt  *time.Time  `json:"last_execution_at,omitempty"`
	LastExecutionStatus string   `json:"last_execution_status,omitempty"`
}

func (rp *RulesProject) ToResponse() *RulesProjectResponse {
	return &RulesProjectResponse{
		ID:          rp.ID,
		ProjectID:   rp.ProjectID,
		Name:        rp.Name,
		Description: rp.Description,
		Nodes:       rp.Nodes,
		Edges:       rp.Edges,
		Version:     rp.Version,
		Status:      rp.Status,
		Settings:    rp.Settings,
		CreatedBy:   rp.CreatedBy,
		UpdatedBy:   rp.UpdatedBy,
		CreatedAt:   rp.CreatedAt,
		UpdatedAt:   rp.UpdatedAt,
	}
}

// ListRulesRequest for filtering and pagination
type ListRulesRequest struct {
	ProjectID string `form:"project_id" validate:"required,uuid"`
	Status    string `form:"status,omitempty" validate:"omitempty,oneof=draft active paused archived"`
	Search    string `form:"search,omitempty"`
	Page      int    `form:"page,default=1" validate:"min=1"`
	Limit     int    `form:"limit,default=20" validate:"min=1,max=100"`
}

// ListRulesResponse for paginated results
type ListRulesResponse struct {
	Data       []*RulesProjectResponse `json:"data"`
	Total      int64                   `json:"total"`
	Page       int                     `json:"page"`
	Limit      int                     `json:"limit"`
	TotalPages int                     `json:"total_pages"`
}

// ExecutionRequest represents a node execution request
type ExecutionRequest struct {
	NodeID      string                 `json:"node_id"`
	NodeType    string                 `json:"node_type"`
	Input       map[string]interface{} `json:"input"`
	Config      map[string]interface{} `json:"config"`
	Context     ExecutionContext       `json:"context"`
}

// ExecutionContext provides execution context
type ExecutionContext struct {
	RulesProjectID uuid.UUID              `json:"rules_project_id"`
	ExecutionID    uuid.UUID              `json:"execution_id"`
	Variables      map[string]interface{} `json:"variables"`
}
