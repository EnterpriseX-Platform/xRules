package webhook

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// WebhookEvent represents the type of webhook events
type WebhookEvent string

const (
	// Rule events
	EventRuleExecuted WebhookEvent = "rule.executed"
	EventRuleFailed   WebhookEvent = "rule.failed"
	EventRuleCreated  WebhookEvent = "rule.created"
	EventRuleUpdated  WebhookEvent = "rule.updated"
	EventRuleDeleted  WebhookEvent = "rule.deleted"

	// Execution events
	EventExecutionStarted   WebhookEvent = "execution.started"
	EventExecutionCompleted WebhookEvent = "execution.completed"
	EventExecutionFailed    WebhookEvent = "execution.failed"
	EventExecutionCancelled WebhookEvent = "execution.cancelled"

	// Connection events
	EventConnectionCreated WebhookEvent = "connection.created"
	EventConnectionUpdated WebhookEvent = "connection.updated"
	EventConnectionDeleted WebhookEvent = "connection.deleted"
	EventConnectionTested  WebhookEvent = "connection.tested"
)

// AllWebhookEvents returns all available webhook events
func AllWebhookEvents() []WebhookEvent {
	return []WebhookEvent{
		EventRuleExecuted,
		EventRuleFailed,
		EventRuleCreated,
		EventRuleUpdated,
		EventRuleDeleted,
		EventExecutionStarted,
		EventExecutionCompleted,
		EventExecutionFailed,
		EventExecutionCancelled,
		EventConnectionCreated,
		EventConnectionUpdated,
		EventConnectionDeleted,
		EventConnectionTested,
	}
}

// Webhook represents a webhook configuration
type Webhook struct {
	ID          uuid.UUID       `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	ProjectID   uuid.UUID       `gorm:"type:uuid;not null;index" json:"project_id"`
	Name        string          `gorm:"not null;size:255" json:"name"`
	URL         string          `gorm:"not null;size:2048" json:"url"`
	Secret      string          `gorm:"not null;size:255" json:"-"` // Never exposed in JSON
	Events      WebhookEvents   `gorm:"type:jsonb;default:'[]'" json:"events"`
	Headers     WebhookHeaders  `gorm:"type:jsonb;default:'{}'" json:"headers"`
	Active      bool            `gorm:"default:true" json:"active"`
	RetryConfig RetryConfig     `gorm:"type:jsonb;default:'{}'" json:"retry_config"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
	DeletedAt   gorm.DeletedAt  `gorm:"index" json:"-"`

	// Relationships
	Deliveries []WebhookDelivery `gorm:"-" json:"deliveries,omitempty"`
}

// TableName returns the table name
func (Webhook) TableName() string {
	return "webhooks"
}

// BeforeCreate hook
func (w *Webhook) BeforeCreate(tx *gorm.DB) error {
	if w.ID == uuid.Nil {
		w.ID = uuid.New()
	}
	// Generate a secret if not provided
	if w.Secret == "" {
		w.Secret = generateSecret()
	}
	// Set default retry config
	if w.RetryConfig.MaxRetries == 0 {
		w.RetryConfig = DefaultRetryConfig()
	}
	return nil
}

// GenerateSignature generates HMAC-SHA256 signature for the payload
func (w *Webhook) GenerateSignature(payload []byte) string {
	mac := hmac.New(sha256.New, []byte(w.Secret))
	mac.Write(payload)
	return hex.EncodeToString(mac.Sum(nil))
}

// HasEvent checks if webhook is subscribed to an event
func (w *Webhook) HasEvent(event WebhookEvent) bool {
	for _, e := range w.Events {
		if e == event {
			return true
		}
	}
	return false
}

// ToResponse converts Webhook to WebhookResponse (hides sensitive fields)
func (w *Webhook) ToResponse() *WebhookResponse {
	return &WebhookResponse{
		ID:          w.ID,
		ProjectID:   w.ProjectID,
		Name:        w.Name,
		URL:         w.URL,
		Events:      w.Events,
		Headers:     w.Headers,
		Active:      w.Active,
		RetryConfig: w.RetryConfig,
		CreatedAt:   w.CreatedAt,
		UpdatedAt:   w.UpdatedAt,
	}
}

// WebhookEvents is a custom type for storing events as JSONB
type WebhookEvents []WebhookEvent

// Value implements the driver.Valuer interface
func (we WebhookEvents) Value() (interface{}, error) {
	return json.Marshal(we)
}

// Scan implements the sql.Scanner interface
func (we *WebhookEvents) Scan(value interface{}) error {
	if value == nil {
		*we = WebhookEvents{}
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, we)
}

// WebhookHeaders represents custom headers for webhook requests
type WebhookHeaders map[string]string

// Value implements the driver.Valuer interface
func (wh WebhookHeaders) Value() (interface{}, error) {
	return json.Marshal(wh)
}

// Scan implements the sql.Scanner interface
func (wh *WebhookHeaders) Scan(value interface{}) error {
	if value == nil {
		*wh = WebhookHeaders{}
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, wh)
}

// RetryConfig represents retry configuration for failed webhooks
type RetryConfig struct {
	MaxRetries     int `json:"max_retries"`
	RetryInterval  int `json:"retry_interval_seconds"` // Initial interval in seconds
	BackoffMultiplier float64 `json:"backoff_multiplier"`
	TimeoutSeconds    int     `json:"timeout_seconds"`
}

// Value implements the driver.Valuer interface
func (rc RetryConfig) Value() (interface{}, error) {
	return json.Marshal(rc)
}

// Scan implements the sql.Scanner interface
func (rc *RetryConfig) Scan(value interface{}) error {
	if value == nil {
		*rc = RetryConfig{}
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, rc)
}

// DefaultRetryConfig returns the default retry configuration
func DefaultRetryConfig() RetryConfig {
	return RetryConfig{
		MaxRetries:        3,
		RetryInterval:     60,
		BackoffMultiplier: 2.0,
		TimeoutSeconds:    30,
	}
}

// WebhookDelivery represents a webhook delivery attempt
type WebhookDelivery struct {
	ID             uuid.UUID       `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WebhookID      uuid.UUID       `gorm:"type:uuid;not null;index" json:"webhook_id"`
	Event          WebhookEvent    `gorm:"not null;size:100" json:"event"`
	Payload        json.RawMessage `gorm:"type:jsonb" json:"payload"`
	Status         DeliveryStatus  `gorm:"not null;size:20;default:'pending'" json:"status"`
	ResponseStatus int             `json:"response_status"`
	ResponseBody   string          `gorm:"type:text" json:"response_body"`
	RequestHeaders json.RawMessage `gorm:"type:jsonb" json:"request_headers"`
	ErrorMessage   string          `gorm:"type:text" json:"error_message,omitempty"`
	Attempts       int             `gorm:"default:0" json:"attempts"`
	NextRetryAt    *time.Time      `json:"next_retry_at,omitempty"`
	CompletedAt    *time.Time      `json:"completed_at,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

// TableName returns the table name
func (WebhookDelivery) TableName() string {
	return "webhook_deliveries"
}

// DeliveryStatus represents the status of a webhook delivery
type DeliveryStatus string

const (
	DeliveryStatusPending   DeliveryStatus = "pending"
	DeliveryStatusDelivered DeliveryStatus = "delivered"
	DeliveryStatusFailed    DeliveryStatus = "failed"
	DeliveryStatusRetrying  DeliveryStatus = "retrying"
)

// IsFinalStatus checks if the delivery status is final (not pending or retrying)
func (ds DeliveryStatus) IsFinalStatus() bool {
	return ds == DeliveryStatusDelivered || ds == DeliveryStatusFailed
}

// ToResponse converts WebhookDelivery to DeliveryResponse
func (wd *WebhookDelivery) ToResponse() *DeliveryResponse {
	return &DeliveryResponse{
		ID:             wd.ID,
		WebhookID:      wd.WebhookID,
		Event:          wd.Event,
		Status:         wd.Status,
		ResponseStatus: wd.ResponseStatus,
		ResponseBody:   wd.ResponseBody,
		Attempts:       wd.Attempts,
		ErrorMessage:   wd.ErrorMessage,
		NextRetryAt:    wd.NextRetryAt,
		CompletedAt:    wd.CompletedAt,
		CreatedAt:      wd.CreatedAt,
		UpdatedAt:      wd.UpdatedAt,
	}
}

// DTOs

// CreateWebhookRequest represents a request to create a webhook
type CreateWebhookRequest struct {
	Name        string         `json:"name" validate:"required,max=255"`
	URL         string         `json:"url" validate:"required,url,max=2048"`
	Secret      string         `json:"secret,omitempty" validate:"omitempty,min=16,max=255"`
	Events      []WebhookEvent `json:"events" validate:"required,min=1,dive,oneof=rule.executed rule.failed rule.created rule.updated rule.deleted execution.started execution.completed execution.failed execution.cancelled connection.created connection.updated connection.deleted connection.tested"`
	Headers     WebhookHeaders `json:"headers,omitempty"`
	Active      bool           `json:"active"`
	RetryConfig *RetryConfig   `json:"retry_config,omitempty"`
}

// UpdateWebhookRequest represents a request to update a webhook
type UpdateWebhookRequest struct {
	Name        string         `json:"name,omitempty" validate:"omitempty,max=255"`
	URL         string         `json:"url,omitempty" validate:"omitempty,url,max=2048"`
	Secret      string         `json:"secret,omitempty" validate:"omitempty,min=16,max=255"`
	Events      []WebhookEvent `json:"events,omitempty" validate:"omitempty,min=1,dive,oneof=rule.executed rule.failed rule.created rule.updated rule.deleted execution.started execution.completed execution.failed execution.cancelled connection.created connection.updated connection.deleted connection.tested"`
	Headers     WebhookHeaders `json:"headers,omitempty"`
	Active      *bool          `json:"active,omitempty"`
	RetryConfig *RetryConfig   `json:"retry_config,omitempty"`
}

// WebhookResponse represents a webhook response (without sensitive data)
type WebhookResponse struct {
	ID          uuid.UUID      `json:"id"`
	ProjectID   uuid.UUID      `json:"project_id"`
	Name        string         `json:"name"`
	URL         string         `json:"url"`
	Events      WebhookEvents  `json:"events"`
	Headers     WebhookHeaders `json:"headers"`
	Active      bool           `json:"active"`
	RetryConfig RetryConfig    `json:"retry_config"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

// DeliveryResponse represents a delivery response
type DeliveryResponse struct {
	ID             uuid.UUID      `json:"id"`
	WebhookID      uuid.UUID      `json:"webhook_id"`
	Event          WebhookEvent   `json:"event"`
	Status         DeliveryStatus `json:"status"`
	ResponseStatus int            `json:"response_status"`
	ResponseBody   string         `json:"response_body"`
	Attempts       int            `json:"attempts"`
	ErrorMessage   string         `json:"error_message,omitempty"`
	NextRetryAt    *time.Time     `json:"next_retry_at,omitempty"`
	CompletedAt    *time.Time     `json:"completed_at,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

// TestWebhookRequest represents a request to test a webhook
type TestWebhookRequest struct {
	Event   WebhookEvent   `json:"event,omitempty"`
	Payload map[string]any `json:"payload,omitempty"`
}

// TestWebhookResponse represents a test webhook response
type TestWebhookResponse struct {
	Success        bool          `json:"success"`
	ResponseStatus int           `json:"response_status"`
	ResponseBody   string        `json:"response_body"`
	LatencyMs      int64         `json:"latency_ms"`
	Error          string        `json:"error,omitempty"`
}

// WebhookPayload represents the structure of a webhook payload
type WebhookPayload struct {
	Event     WebhookEvent   `json:"event"`
	Timestamp time.Time      `json:"timestamp"`
	Data      map[string]any `json:"data"`
}

// ListWebhooksRequest for filtering and pagination
type ListWebhooksRequest struct {
	ProjectID string `form:"project_id" validate:"required,uuid"`
	Active    *bool  `form:"active,omitempty"`
	Page      int    `form:"page,default=1" validate:"min=1"`
	Limit     int    `form:"limit,default=20" validate:"min=1,max=100"`
}

// ListWebhooksResponse for paginated results
type ListWebhooksResponse struct {
	Data       []*WebhookResponse `json:"data"`
	Total      int64              `json:"total"`
	Page       int                `json:"page"`
	Limit      int                `json:"limit"`
	TotalPages int                `json:"total_pages"`
}

// ListDeliveriesRequest for filtering deliveries
type ListDeliveriesRequest struct {
	Status string `form:"status,omitempty" validate:"omitempty,oneof=pending delivered failed retrying"`
	Event  string `form:"event,omitempty"`
	Page   int    `form:"page,default=1" validate:"min=1"`
	Limit  int    `form:"limit,default=20" validate:"min=1,max=100"`
}

// ListDeliveriesResponse for paginated delivery results
type ListDeliveriesResponse struct {
	Data       []*DeliveryResponse `json:"data"`
	Total      int64               `json:"total"`
	Page       int                 `json:"page"`
	Limit      int                 `json:"limit"`
	TotalPages int                 `json:"total_pages"`
}

// generateSecret generates a random secret for webhook signing
func generateSecret() string {
	b := make([]byte, 32)
	for i := range b {
		b[i] = byte(65 + i%26) // A-Z
	}
	return "whsec_" + uuid.New().String()[:32]
}
