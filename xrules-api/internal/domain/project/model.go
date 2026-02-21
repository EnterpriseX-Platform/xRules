package project

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Project represents a project within a workspace
type Project struct {
	ID          uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID      `gorm:"type:uuid;not null;index" json:"workspace_id"`
	Name        string         `gorm:"not null;size:255" json:"name"`
	Description string         `json:"description,omitempty"`
	Settings    ProjectSettings `gorm:"type:jsonb;default:'{}'" json:"settings"`
	IsActive    bool           `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`

	// Relationships
	Workspace   interface{} `gorm:"-" json:"workspace,omitempty"`
	RulesProjects interface{} `gorm:"-" json:"rules_projects,omitempty"`
}

// ProjectSettings contains project configuration
type ProjectSettings struct {
	DefaultTimeout int               `json:"default_timeout"`
	MaxRetries     int               `json:"max_retries"`
	Environment    string            `json:"environment"` // development, staging, production
	Variables      map[string]string `json:"variables"`
}

// TableName returns the table name
func (Project) TableName() string {
	return "projects"
}

// BeforeCreate hook
func (p *Project) BeforeCreate(tx *gorm.DB) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	if p.Settings.Environment == "" {
		p.Settings.Environment = "development"
	}
	return nil
}

// DTOs

type CreateProjectRequest struct {
	Name        string          `json:"name" validate:"required,max:255"`
	Description string          `json:"description,omitempty"`
	Settings    ProjectSettings `json:"settings,omitempty"`
}

type UpdateProjectRequest struct {
	Name        string          `json:"name,omitempty" validate:"omitempty,max:255"`
	Description string          `json:"description,omitempty"`
	Settings    ProjectSettings `json:"settings,omitempty"`
	IsActive    *bool           `json:"is_active,omitempty"`
}

type ProjectResponse struct {
	ID          uuid.UUID       `json:"id"`
	WorkspaceID uuid.UUID       `json:"workspace_id"`
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	Settings    ProjectSettings `json:"settings"`
	IsActive    bool            `json:"is_active"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
	
	// Aggregated fields
	RulesCount    int `json:"rules_count,omitempty"`
	LastExecution interface{} `json:"last_execution,omitempty"`
}

func (p *Project) ToResponse() *ProjectResponse {
	return &ProjectResponse{
		ID:          p.ID,
		WorkspaceID: p.WorkspaceID,
		Name:        p.Name,
		Description: p.Description,
		Settings:    p.Settings,
		IsActive:    p.IsActive,
		CreatedAt:   p.CreatedAt,
		UpdatedAt:   p.UpdatedAt,
	}
}

// ListProjectsRequest for filtering and pagination
type ListProjectsRequest struct {
	WorkspaceID string `form:"workspace_id" validate:"required,uuid"`
	Search      string `form:"search,omitempty"`
	Page        int    `form:"page,default=1" validate:"min=1"`
	Limit       int    `form:"limit,default=20" validate:"min=1,max=100"`
}

// ListProjectsResponse for paginated results
type ListProjectsResponse struct {
	Data       []*ProjectResponse `json:"data"`
	Total      int64              `json:"total"`
	Page       int                `json:"page"`
	Limit      int                `json:"limit"`
	TotalPages int                `json:"total_pages"`
}
