package workspace

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Plan represents workspace plan type
type Plan string

const (
	PlanFree       Plan = "free"
	PlanStarter    Plan = "starter"
	PlanPro        Plan = "pro"
	PlanEnterprise Plan = "enterprise"
)

// Workspace represents a workspace (tenant) in the system
type Workspace struct {
	ID          uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Name        string         `gorm:"not null;size:255" json:"name"`
	Slug        string         `gorm:"uniqueIndex;not null;size:100" json:"slug"`
	Description string         `json:"description,omitempty"`
	OwnerID     uuid.UUID      `gorm:"type:uuid;not null;index" json:"owner_id"`
	Plan        Plan           `gorm:"not null;default:'free'" json:"plan"`
	Settings    WorkspaceSettings `gorm:"type:jsonb;default:'{}'" json:"settings"`
	IsActive    bool           `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`

	// Relationships
	Owner      interface{}       `gorm:"-" json:"owner,omitempty"`
	Members    []WorkspaceMember `json:"members,omitempty"`
	Projects   interface{}       `gorm:"-" json:"projects,omitempty"`
	Connections interface{}      `gorm:"-" json:"connections,omitempty"`
}

// WorkspaceSettings contains workspace configuration
type WorkspaceSettings struct {
	MaxProjects       int  `json:"max_projects"`
	MaxRulesPerProject int  `json:"max_rules_per_project"`
	MaxExecutions     int  `json:"max_executions"`
	MaxMembers        int  `json:"max_members"`
	AllowCustomConnections bool `json:"allow_custom_connections"`
}

// Default settings by plan
var DefaultPlanSettings = map[Plan]WorkspaceSettings{
	PlanFree: {
		MaxProjects:            3,
		MaxRulesPerProject:     10,
		MaxExecutions:          1000,
		MaxMembers:             3,
		AllowCustomConnections: false,
	},
	PlanStarter: {
		MaxProjects:            10,
		MaxRulesPerProject:     50,
		MaxExecutions:          10000,
		MaxMembers:             10,
		AllowCustomConnections: true,
	},
	PlanPro: {
		MaxProjects:            50,
		MaxRulesPerProject:     200,
		MaxExecutions:          100000,
		MaxMembers:             50,
		AllowCustomConnections: true,
	},
	PlanEnterprise: {
		MaxProjects:            -1, // unlimited
		MaxRulesPerProject:     -1,
		MaxExecutions:          -1,
		MaxMembers:             -1,
		AllowCustomConnections: true,
	},
}

// TableName returns the table name
func (Workspace) TableName() string {
	return "workspaces"
}

// BeforeCreate hook
func (w *Workspace) BeforeCreate(tx *gorm.DB) error {
	if w.ID == uuid.Nil {
		w.ID = uuid.New()
	}
	if w.Settings.MaxProjects == 0 {
		w.Settings = DefaultPlanSettings[w.Plan]
	}
	return nil
}

// WorkspaceMember represents a user's membership in a workspace
type WorkspaceMember struct {
	ID          uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID `gorm:"type:uuid;not null;index:idx_workspace_user,unique" json:"workspace_id"`
	UserID      uuid.UUID `gorm:"type:uuid;not null;index:idx_workspace_user,unique" json:"user_id"`
	Role        string    `gorm:"not null;default:'member'" json:"role"` // owner, admin, member, viewer
	JoinedAt    time.Time `gorm:"not null;default:now()" json:"joined_at"`

	// Relationships
	User *interface{} `json:"user,omitempty"`
}

// TableName returns the table name
func (WorkspaceMember) TableName() string {
	return "workspace_members"
}

// HasPermission checks if member has required permission level
func (wm *WorkspaceMember) HasPermission(requiredRole string) bool {
	hierarchy := map[string]int{
		"owner":  4,
		"admin":  3,
		"member": 2,
		"viewer": 1,
	}
	
	return hierarchy[wm.Role] >= hierarchy[requiredRole]
}

// DTOs

type CreateWorkspaceRequest struct {
	Name        string `json:"name" validate:"required,max:255"`
	Slug        string `json:"slug" validate:"required,max:100,alphanumdash"`
	Description string `json:"description,omitempty"`
}

type UpdateWorkspaceRequest struct {
	Name        string             `json:"name,omitempty" validate:"omitempty,max:255"`
	Description string             `json:"description,omitempty"`
	Settings    *WorkspaceSettings `json:"settings,omitempty"`
}

type AddMemberRequest struct {
	UserID string `json:"user_id" validate:"required,uuid"`
	Role   string `json:"role" validate:"required,oneof=admin member viewer"`
}

type UpdateMemberRequest struct {
	Role string `json:"role" validate:"required,oneof=admin member viewer"`
}

type WorkspaceResponse struct {
	ID          uuid.UUID         `json:"id"`
	Name        string            `json:"name"`
	Slug        string            `json:"slug"`
	Description string            `json:"description,omitempty"`
	OwnerID     uuid.UUID         `json:"owner_id"`
	Plan        Plan              `json:"plan"`
	Settings    WorkspaceSettings `json:"settings"`
	IsActive    bool              `json:"is_active"`
	MemberCount int               `json:"member_count,omitempty"`
	CreatedAt   time.Time         `json:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at"`
}

func (w *Workspace) ToResponse() *WorkspaceResponse {
	return &WorkspaceResponse{
		ID:          w.ID,
		Name:        w.Name,
		Slug:        w.Slug,
		Description: w.Description,
		OwnerID:     w.OwnerID,
		Plan:        w.Plan,
		Settings:    w.Settings,
		IsActive:    w.IsActive,
		CreatedAt:   w.CreatedAt,
		UpdatedAt:   w.UpdatedAt,
	}
}

type MemberResponse struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"user_id"`
	Role      string    `json:"role"`
	JoinedAt  time.Time `json:"joined_at"`
	UserName  string    `json:"user_name,omitempty"`
	UserEmail string    `json:"user_email,omitempty"`
}
