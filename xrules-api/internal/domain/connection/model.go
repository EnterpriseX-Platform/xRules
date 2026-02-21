package connection

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Type represents connection type
type Type string

const (
	TypeDatabase   Type = "database"
	TypeHTTP       Type = "http"
	TypeSFTP       Type = "sftp"
	TypeRedis      Type = "redis"
	TypeKafka      Type = "kafka"
	TypeAWS        Type = "aws"
	TypeGCP        Type = "gcp"
	TypeAzure      Type = "azure"
	TypeWebhook    Type = "webhook"
	TypeEmail      Type = "email"
	TypeSlack      Type = "slack"
	TypeCustom     Type = "custom"
)

// Status represents connection status
type Status string

const (
	StatusPending  Status = "pending"
	StatusActive   Status = "active"
	StatusError    Status = "error"
	StatusDisabled Status = "disabled"
)

// Connection represents an external service connection
type Connection struct {
	ID            uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID   uuid.UUID      `gorm:"type:uuid;not null;index" json:"workspace_id"`
	Name          string         `gorm:"not null;size:255" json:"name"`
	Type          Type           `gorm:"not null" json:"type"`
	Description   string         `json:"description,omitempty"`
	Config        Config         `gorm:"type:jsonb;default:'{}'" json:"config"`
	Credentials   Credentials    `gorm:"type:jsonb" json:"-"` // Never expose credentials
	Status        Status         `gorm:"not null;default:'pending'" json:"status"`
	LastTestedAt  *time.Time     `json:"last_tested_at,omitempty"`
	LastError     string         `json:"last_error,omitempty"`
	HealthCheck   HealthCheckConfig `gorm:"type:jsonb;default:'{}'" json:"health_check"`
	CreatedBy     uuid.UUID      `gorm:"type:uuid;not null" json:"created_by"`
	UpdatedBy     uuid.UUID      `gorm:"type:uuid" json:"updated_by,omitempty"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
}

// Config contains connection configuration (non-sensitive)
type Config struct {
	Host     string            `json:"host,omitempty"`
	Port     int               `json:"port,omitempty"`
	Database string            `json:"database,omitempty"`
	SSLMode  string            `json:"ssl_mode,omitempty"`
	BaseURL  string            `json:"base_url,omitempty"`
	Region   string            `json:"region,omitempty"`
	Timeout  int               `json:"timeout,omitempty"`
	Options  map[string]string `json:"options,omitempty"`
}

// Credentials contains sensitive connection data (encrypted)
type Credentials struct {
	Username     string            `json:"username,omitempty"`
	Password     string            `json:"password,omitempty"`
	APIKey       string            `json:"api_key,omitempty"`
	SecretKey    string            `json:"secret_key,omitempty"`
	Token        string            `json:"token,omitempty"`
	PrivateKey   string            `json:"private_key,omitempty"`
	Certificate  string            `json:"certificate,omitempty"`
	OAuth2       *OAuth2Credentials `json:"oauth2,omitempty"`
}

// OAuth2Credentials for OAuth2 connections
type OAuth2Credentials struct {
	ClientID     string   `json:"client_id"`
	ClientSecret string   `json:"client_secret"`
	AuthURL      string   `json:"auth_url"`
	TokenURL     string   `json:"token_url"`
	Scopes       []string `json:"scopes"`
	AccessToken  string   `json:"access_token,omitempty"`
	RefreshToken string   `json:"refresh_token,omitempty"`
	ExpiresAt    int64    `json:"expires_at,omitempty"`
}

// HealthCheckConfig for connection health monitoring
type HealthCheckConfig struct {
	Enabled  bool `json:"enabled"`
	Interval int  `json:"interval"` // seconds
	Timeout  int  `json:"timeout"`  // seconds
}

// TableName returns the table name
func (Connection) TableName() string {
	return "connections"
}

// BeforeCreate hook
func (c *Connection) BeforeCreate(tx *gorm.DB) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	return nil
}

// MaskCredentials returns connection with masked credentials for safe display
func (c *Connection) MaskCredentials() *Connection {
	masked := *c
	masked.Credentials = Credentials{}
	
	// Mask sensitive fields in config if needed
	if masked.Credentials.Password != "" {
		masked.Credentials.Password = "***"
	}
	if masked.Credentials.APIKey != "" {
		masked.Credentials.APIKey = maskString(masked.Credentials.APIKey)
	}
	if masked.Credentials.SecretKey != "" {
		masked.Credentials.SecretKey = "***"
	}
	if masked.Credentials.Token != "" {
		masked.Credentials.Token = maskString(masked.Credentials.Token)
	}
	
	return &masked
}

func maskString(s string) string {
	if len(s) <= 8 {
		return "***"
	}
	return s[:4] + "..." + s[len(s)-4:]
}

// DTOs

type CreateConnectionRequest struct {
	Name        string      `json:"name" validate:"required,max:255"`
	Type        Type        `json:"type" validate:"required,oneof=database http sftp redis kafka aws gcp azure webhook email slack custom"`
	Description string      `json:"description,omitempty"`
	Config      Config      `json:"config"`
	Credentials Credentials `json:"credentials"`
	HealthCheck HealthCheckConfig `json:"health_check,omitempty"`
}

type UpdateConnectionRequest struct {
	Name        string      `json:"name,omitempty" validate:"omitempty,max:255"`
	Description string      `json:"description,omitempty"`
	Config      *Config     `json:"config,omitempty"`
	Credentials *Credentials `json:"credentials,omitempty"`
	HealthCheck *HealthCheckConfig `json:"health_check,omitempty"`
	Status      *Status     `json:"status,omitempty" validate:"omitempty,oneof=pending active error disabled"`
}

type TestConnectionRequest struct {
	Type        Type        `json:"type" validate:"required"`
	Config      Config      `json:"config"`
	Credentials Credentials `json:"credentials"`
}

type ConnectionResponse struct {
	ID           uuid.UUID         `json:"id"`
	WorkspaceID  uuid.UUID         `json:"workspace_id"`
	Name         string            `json:"name"`
	Type         Type              `json:"type"`
	Description  string            `json:"description,omitempty"`
	Config       Config            `json:"config"`
	Status       Status            `json:"status"`
	LastTestedAt *time.Time        `json:"last_tested_at,omitempty"`
	LastError    string            `json:"last_error,omitempty"`
	HealthCheck  HealthCheckConfig `json:"health_check"`
	CreatedBy    uuid.UUID         `json:"created_by"`
	UpdatedBy    uuid.UUID         `json:"updated_by,omitempty"`
	CreatedAt    time.Time         `json:"created_at"`
	UpdatedAt    time.Time         `json:"updated_at"`
	
	// Safe credentials preview
	HasCredentials bool `json:"has_credentials"`
}

func (c *Connection) ToResponse() *ConnectionResponse {
	return &ConnectionResponse{
		ID:             c.ID,
		WorkspaceID:    c.WorkspaceID,
		Name:           c.Name,
		Type:           c.Type,
		Description:    c.Description,
		Config:         c.Config,
		Status:         c.Status,
		LastTestedAt:   c.LastTestedAt,
		LastError:      c.LastError,
		HealthCheck:    c.HealthCheck,
		CreatedBy:      c.CreatedBy,
		UpdatedBy:      c.UpdatedBy,
		CreatedAt:      c.CreatedAt,
		UpdatedAt:      c.UpdatedAt,
		HasCredentials: c.Credentials.Password != "" || c.Credentials.APIKey != "" || c.Credentials.Token != "",
	}
}

// ListConnectionsRequest for filtering and pagination
type ListConnectionsRequest struct {
	WorkspaceID string `form:"workspace_id" validate:"required,uuid"`
	Type        string `form:"type,omitempty"`
	Status      string `form:"status,omitempty"`
	Search      string `form:"search,omitempty"`
	Page        int    `form:"page,default=1" validate:"min=1"`
	Limit       int    `form:"limit,default=20" validate:"min=1,max=100"`
}

// ListConnectionsResponse for paginated results
type ListConnectionsResponse struct {
	Data       []*ConnectionResponse `json:"data"`
	Total      int64                 `json:"total"`
	Page       int                   `json:"page"`
	Limit      int                   `json:"limit"`
	TotalPages int                   `json:"total_pages"`
}

// TestResult represents connection test result
type TestResult struct {
	Success   bool          `json:"success"`
	Message   string        `json:"message"`
	Latency   time.Duration `json:"latency,omitempty"`
	Timestamp time.Time     `json:"timestamp"`
}
