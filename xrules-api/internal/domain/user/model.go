package user

import (
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// Role represents user role
type Role string

const (
	RoleAdmin     Role = "admin"
	RoleUser      Role = "user"
	RoleViewer    Role = "viewer"
)

// User represents a user in the system
type User struct {
	ID        uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Email     string         `gorm:"uniqueIndex;not null;size:255" json:"email"`
	Password  string         `gorm:"not null" json:"-"`
	Name      string         `gorm:"not null;size:255" json:"name"`
	Role      Role           `gorm:"not null;default:'user'" json:"role"`
	Avatar    string         `json:"avatar,omitempty"`
	IsActive  bool           `gorm:"default:true" json:"is_active"`
	LastLogin *time.Time     `json:"last_login,omitempty"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// Relationships
	Workspaces []WorkspaceMember `json:"workspaces,omitempty"`

	// OAuth accounts
	OAuthAccounts []OAuthAccount `json:"oauth_accounts,omitempty" gorm:"foreignKey:UserID"`
}

// TableName returns the table name
func (User) TableName() string {
	return "users"
}

// OAuthProvider represents OAuth provider type
type OAuthProvider string

const (
	OAuthProviderGoogle    OAuthProvider = "google"
	OAuthProviderGitHub    OAuthProvider = "github"
	OAuthProviderMicrosoft OAuthProvider = "microsoft"
	OAuthProviderOIDC      OAuthProvider = "oidc"
)

// OAuthAccount represents an OAuth account linked to a user
type OAuthAccount struct {
	ID           uuid.UUID     `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID       uuid.UUID     `gorm:"type:uuid;not null;index" json:"user_id"`
	Provider     OAuthProvider `gorm:"not null;size:50" json:"provider"`
	ProviderID   string        `gorm:"not null;size:255;index" json:"provider_id"`
	Email        string        `gorm:"size:255" json:"email"`
	Name         string        `gorm:"size:255" json:"name"`
	Avatar       string        `json:"avatar"`
	AccessToken  string        `gorm:"-" json:"-"` // Not stored in DB
	RefreshToken string        `gorm:"-" json:"-"` // Not stored in DB
	CreatedAt    time.Time     `json:"created_at"`
	UpdatedAt    time.Time     `json:"updated_at"`
}

// TableName returns the table name
func (OAuthAccount) TableName() string {
	return "oauth_accounts"
}

// Unique index for provider + provider_id combination
func (OAuthAccount) Indexes() []string {
	return []string{"CREATE UNIQUE INDEX idx_oauth_provider_id ON oauth_accounts(provider, provider_id)"}
}

// BeforeCreate hook
func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return nil
}

// SetPassword hashes and sets the password
func (u *User) SetPassword(password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	u.Password = string(hash)
	return nil
}

// CheckPassword verifies the password
func (u *User) CheckPassword(password string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(password))
	return err == nil
}

// WorkspaceMemberRole represents workspace member role
type WorkspaceMemberRole string

const (
	WorkspaceRoleOwner   WorkspaceMemberRole = "owner"
	WorkspaceRoleAdmin   WorkspaceMemberRole = "admin"
	WorkspaceRoleMember  WorkspaceMemberRole = "member"
	WorkspaceRoleViewer  WorkspaceMemberRole = "viewer"
)

// WorkspaceMember represents a user's membership in a workspace
type WorkspaceMember struct {
	ID          uuid.UUID           `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID           `gorm:"type:uuid;not null;index" json:"workspace_id"`
	UserID      uuid.UUID           `gorm:"type:uuid;not null;index" json:"user_id"`
	Role        WorkspaceMemberRole `gorm:"not null;default:'member'" json:"role"`
	JoinedAt    time.Time           `gorm:"not null;default:now()" json:"joined_at"`

	// Relationships
	Workspace interface{} `gorm:"-" json:"workspace,omitempty"`
	User      *User       `json:"user,omitempty"`
}

// TableName returns the table name
func (WorkspaceMember) TableName() string {
	return "workspace_members"
}

// HasPermission checks if member has required permission
func (wm *WorkspaceMember) HasPermission(requiredRole WorkspaceMemberRole) bool {
	roleHierarchy := map[WorkspaceMemberRole]int{
		WorkspaceRoleOwner:  4,
		WorkspaceRoleAdmin:  3,
		WorkspaceRoleMember: 2,
		WorkspaceRoleViewer: 1,
	}
	
	return roleHierarchy[wm.Role] >= roleHierarchy[requiredRole]
}

// DTOs

type CreateUserRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min:8"`
	Name     string `json:"name" validate:"required,max:255"`
}

type UpdateUserRequest struct {
	Name   string `json:"name,omitempty" validate:"omitempty,max:255"`
	Avatar string `json:"avatar,omitempty"`
}

type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" validate:"required"`
	NewPassword     string `json:"new_password" validate:"required,min:8"`
}

type UserResponse struct {
	ID        uuid.UUID  `json:"id"`
	Email     string     `json:"email"`
	Name      string     `json:"name"`
	Role      Role       `json:"role"`
	Avatar    string     `json:"avatar,omitempty"`
	IsActive  bool       `json:"is_active"`
	LastLogin *time.Time `json:"last_login,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

func (u *User) ToResponse() *UserResponse {
	return &UserResponse{
		ID:        u.ID,
		Email:     u.Email,
		Name:      u.Name,
		Role:      u.Role,
		Avatar:    u.Avatar,
		IsActive:  u.IsActive,
		LastLogin: u.LastLogin,
		CreatedAt: u.CreatedAt,
	}
}

// OAuth DTOs

type OAuthUserInfo struct {
	ProviderID string `json:"provider_id"`
	Email      string `json:"email"`
	Name       string `json:"name"`
	Avatar     string `json:"avatar"`
}

type OAuthLoginRequest struct {
	Provider   OAuthProvider `json:"provider" validate:"required,oneof=google github microsoft oidc"`
	Code       string        `json:"code" validate:"required"`
	State      string        `json:"state" validate:"required"`
	RedirectURI string       `json:"redirect_uri"`
}

type OAuthAccountResponse struct {
	ID         uuid.UUID     `json:"id"`
	Provider   OAuthProvider `json:"provider"`
	ProviderID string        `json:"provider_id"`
	Email      string        `json:"email"`
	Name       string        `json:"name"`
	CreatedAt  time.Time     `json:"created_at"`
}
