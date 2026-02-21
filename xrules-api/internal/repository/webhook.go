package repository

import (
	"context"
	"fmt"

	"xrules-api/internal/domain/webhook"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// WebhookRepository defines the interface for webhook data access
type WebhookRepository interface {
	Create(ctx context.Context, w *webhook.Webhook) error
	GetByID(ctx context.Context, id uuid.UUID) (*webhook.Webhook, error)
	GetByProjectID(ctx context.Context, projectID uuid.UUID, page, limit int) ([]*webhook.Webhook, int64, error)
	GetActiveByProjectAndEvent(ctx context.Context, projectID uuid.UUID, event webhook.WebhookEvent) ([]*webhook.Webhook, error)
	Update(ctx context.Context, w *webhook.Webhook) error
	Delete(ctx context.Context, id uuid.UUID) error
	
	// Delivery methods
	CreateDelivery(ctx context.Context, d *webhook.WebhookDelivery) error
	GetDeliveryByID(ctx context.Context, id uuid.UUID) (*webhook.WebhookDelivery, error)
	GetDeliveriesByWebhookID(ctx context.Context, webhookID uuid.UUID, page, limit int) ([]*webhook.WebhookDelivery, int64, error)
	UpdateDelivery(ctx context.Context, d *webhook.WebhookDelivery) error
	GetPendingDeliveries(ctx context.Context, limit int) ([]*webhook.WebhookDelivery, error)
}

// webhookRepository implements WebhookRepository
type webhookRepository struct {
	db *gorm.DB
}

// NewWebhookRepository creates a new webhook repository
func NewWebhookRepository(db *gorm.DB) WebhookRepository {
	return &webhookRepository{db: db}
}

// Create creates a new webhook
func (r *webhookRepository) Create(ctx context.Context, w *webhook.Webhook) error {
	return r.db.WithContext(ctx).Create(w).Error
}

// GetByID retrieves a webhook by ID
func (r *webhookRepository) GetByID(ctx context.Context, id uuid.UUID) (*webhook.Webhook, error) {
	var w webhook.Webhook
	err := r.db.WithContext(ctx).First(&w, "id = ?", id).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("webhook not found")
		}
		return nil, err
	}
	return &w, nil
}

// GetByProjectID retrieves webhooks by project ID with pagination
func (r *webhookRepository) GetByProjectID(ctx context.Context, projectID uuid.UUID, page, limit int) ([]*webhook.Webhook, int64, error) {
	var webhooks []*webhook.Webhook
	var total int64

	offset := (page - 1) * limit

	query := r.db.WithContext(ctx).Model(&webhook.Webhook{}).Where("project_id = ?", projectID)
	
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if err := query.Order("created_at DESC").Offset(offset).Limit(limit).Find(&webhooks).Error; err != nil {
		return nil, 0, err
	}

	return webhooks, total, nil
}

// GetActiveByProjectAndEvent retrieves active webhooks for a project and event
func (r *webhookRepository) GetActiveByProjectAndEvent(ctx context.Context, projectID uuid.UUID, event webhook.WebhookEvent) ([]*webhook.Webhook, error) {
	var webhooks []*webhook.Webhook
	err := r.db.WithContext(ctx).
		Where("project_id = ? AND active = ?", projectID, true).
		Where("events @> ?::jsonb", fmt.Sprintf("[\"%s\"]", event)).
		Find(&webhooks).Error
	return webhooks, err
}

// Update updates a webhook
func (r *webhookRepository) Update(ctx context.Context, w *webhook.Webhook) error {
	return r.db.WithContext(ctx).Save(w).Error
}

// Delete deletes a webhook
func (r *webhookRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&webhook.Webhook{}, "id = ?", id).Error
}

// CreateDelivery creates a new delivery record
func (r *webhookRepository) CreateDelivery(ctx context.Context, d *webhook.WebhookDelivery) error {
	return r.db.WithContext(ctx).Create(d).Error
}

// GetDeliveryByID retrieves a delivery by ID
func (r *webhookRepository) GetDeliveryByID(ctx context.Context, id uuid.UUID) (*webhook.WebhookDelivery, error) {
	var d webhook.WebhookDelivery
	err := r.db.WithContext(ctx).First(&d, "id = ?", id).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("delivery not found")
		}
		return nil, err
	}
	return &d, nil
}

// GetDeliveriesByWebhookID retrieves deliveries by webhook ID
func (r *webhookRepository) GetDeliveriesByWebhookID(ctx context.Context, webhookID uuid.UUID, page, limit int) ([]*webhook.WebhookDelivery, int64, error) {
	var deliveries []*webhook.WebhookDelivery
	var total int64

	offset := (page - 1) * limit

	query := r.db.WithContext(ctx).Model(&webhook.WebhookDelivery{}).Where("webhook_id = ?", webhookID)
	
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if err := query.Order("created_at DESC").Offset(offset).Limit(limit).Find(&deliveries).Error; err != nil {
		return nil, 0, err
	}

	return deliveries, total, nil
}

// UpdateDelivery updates a delivery
func (r *webhookRepository) UpdateDelivery(ctx context.Context, d *webhook.WebhookDelivery) error {
	return r.db.WithContext(ctx).Save(d).Error
}

// GetPendingDeliveries retrieves pending deliveries that need to be retried
func (r *webhookRepository) GetPendingDeliveries(ctx context.Context, limit int) ([]*webhook.WebhookDelivery, error) {
	var deliveries []*webhook.WebhookDelivery
	err := r.db.WithContext(ctx).
		Where("status IN ?", []webhook.DeliveryStatus{webhook.DeliveryStatusPending, webhook.DeliveryStatusRetrying}).
		Where("next_retry_at IS NULL OR next_retry_at <= NOW()").
		Order("created_at ASC").
		Limit(limit).
		Find(&deliveries).Error
	return deliveries, err
}
