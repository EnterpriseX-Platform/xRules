package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"xrules-api/internal/domain/webhook"
	"xrules-api/internal/repository"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// WebhookService defines the interface for webhook operations
type WebhookService interface {
	CreateWebhook(ctx context.Context, projectID uuid.UUID, req *webhook.CreateWebhookRequest) (*webhook.Webhook, error)
	GetWebhook(ctx context.Context, id uuid.UUID) (*webhook.Webhook, error)
	ListWebhooks(ctx context.Context, projectID uuid.UUID, page, limit int) (*webhook.ListWebhooksResponse, error)
	UpdateWebhook(ctx context.Context, id uuid.UUID, req *webhook.UpdateWebhookRequest) (*webhook.Webhook, error)
	DeleteWebhook(ctx context.Context, id uuid.UUID) error
	TestWebhook(ctx context.Context, id uuid.UUID, req *webhook.TestWebhookRequest) (*webhook.TestWebhookResponse, error)
	
	// Delivery methods
	ListDeliveries(ctx context.Context, webhookID uuid.UUID, page, limit int) (*webhook.ListDeliveriesResponse, error)
	GetDelivery(ctx context.Context, id uuid.UUID) (*webhook.WebhookDelivery, error)
	
	// Trigger webhook
	TriggerWebhooks(ctx context.Context, projectID uuid.UUID, event webhook.WebhookEvent, data map[string]any) error
	
	// Retry failed deliveries
	RetryDelivery(ctx context.Context, deliveryID uuid.UUID) error
	ProcessPendingDeliveries(ctx context.Context) error
}

// webhookService implements WebhookService
type webhookService struct {
	repo   repository.WebhookRepository
	client *http.Client
	logger *zap.Logger
}

// NewWebhookService creates a new webhook service
func NewWebhookService(repo repository.WebhookRepository, logger *zap.Logger) WebhookService {
	return &webhookService{
		repo: repo,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
		logger: logger,
	}
}

// CreateWebhook creates a new webhook
func (s *webhookService) CreateWebhook(ctx context.Context, projectID uuid.UUID, req *webhook.CreateWebhookRequest) (*webhook.Webhook, error) {
	w := &webhook.Webhook{
		ProjectID: projectID,
		Name:      req.Name,
		URL:       req.URL,
		Secret:    req.Secret,
		Events:    req.Events,
		Headers:   req.Headers,
		Active:    req.Active,
	}
	
	if req.RetryConfig != nil {
		w.RetryConfig = *req.RetryConfig
	}
	
	if err := s.repo.Create(ctx, w); err != nil {
		return nil, fmt.Errorf("failed to create webhook: %w", err)
	}
	
	return w, nil
}

// GetWebhook retrieves a webhook by ID
func (s *webhookService) GetWebhook(ctx context.Context, id uuid.UUID) (*webhook.Webhook, error) {
	return s.repo.GetByID(ctx, id)
}

// ListWebhooks lists webhooks for a project
func (s *webhookService) ListWebhooks(ctx context.Context, projectID uuid.UUID, page, limit int) (*webhook.ListWebhooksResponse, error) {
	webhooks, total, err := s.repo.GetByProjectID(ctx, projectID, page, limit)
	if err != nil {
		return nil, err
	}

	response := &webhook.ListWebhooksResponse{
		Data:       make([]*webhook.WebhookResponse, len(webhooks)),
		Total:      total,
		Page:       page,
		Limit:      limit,
		TotalPages: int((total + int64(limit) - 1) / int64(limit)),
	}

	for i, w := range webhooks {
		response.Data[i] = w.ToResponse()
	}

	return response, nil
}

// UpdateWebhook updates a webhook
func (s *webhookService) UpdateWebhook(ctx context.Context, id uuid.UUID, req *webhook.UpdateWebhookRequest) (*webhook.Webhook, error) {
	w, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if req.Name != "" {
		w.Name = req.Name
	}
	if req.URL != "" {
		w.URL = req.URL
	}
	if req.Secret != "" {
		w.Secret = req.Secret
	}
	if len(req.Events) > 0 {
		w.Events = req.Events
	}
	if req.Headers != nil {
		w.Headers = req.Headers
	}
	if req.Active != nil {
		w.Active = *req.Active
	}
	if req.RetryConfig != nil {
		w.RetryConfig = *req.RetryConfig
	}

	if err := s.repo.Update(ctx, w); err != nil {
		return nil, fmt.Errorf("failed to update webhook: %w", err)
	}

	return w, nil
}

// DeleteWebhook deletes a webhook
func (s *webhookService) DeleteWebhook(ctx context.Context, id uuid.UUID) error {
	return s.repo.Delete(ctx, id)
}

// TestWebhook tests a webhook by sending a test event
func (s *webhookService) TestWebhook(ctx context.Context, id uuid.UUID, req *webhook.TestWebhookRequest) (*webhook.TestWebhookResponse, error) {
	w, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	event := req.Event
	if event == "" {
		event = webhook.EventRuleExecuted
	}

	payload := webhook.WebhookPayload{
		Event:     event,
		Timestamp: time.Now(),
		Data:      req.Payload,
	}
	if payload.Data == nil {
		payload.Data = map[string]any{
			"message": "This is a test event from XRules",
			"test":    true,
		}
	}

	start := time.Now()
	resp, err := s.sendWebhook(ctx, w, event, payload)
	latency := time.Since(start).Milliseconds()

	if err != nil {
		return &webhook.TestWebhookResponse{
			Success:   false,
			LatencyMs: latency,
			Error:     err.Error(),
		}, nil
	}

	return &webhook.TestWebhookResponse{
		Success:        true,
		ResponseStatus: resp.StatusCode,
		ResponseBody:   resp.Body,
		LatencyMs:      latency,
	}, nil
}

// ListDeliveries lists deliveries for a webhook
func (s *webhookService) ListDeliveries(ctx context.Context, webhookID uuid.UUID, page, limit int) (*webhook.ListDeliveriesResponse, error) {
	deliveries, total, err := s.repo.GetDeliveriesByWebhookID(ctx, webhookID, page, limit)
	if err != nil {
		return nil, err
	}

	response := &webhook.ListDeliveriesResponse{
		Data:       make([]*webhook.DeliveryResponse, len(deliveries)),
		Total:      total,
		Page:       page,
		Limit:      limit,
		TotalPages: int((total + int64(limit) - 1) / int64(limit)),
	}

	for i, d := range deliveries {
		response.Data[i] = d.ToResponse()
	}

	return response, nil
}

// GetDelivery retrieves a delivery by ID
func (s *webhookService) GetDelivery(ctx context.Context, id uuid.UUID) (*webhook.WebhookDelivery, error) {
	return s.repo.GetDeliveryByID(ctx, id)
}

// TriggerWebhooks triggers all webhooks subscribed to an event
func (s *webhookService) TriggerWebhooks(ctx context.Context, projectID uuid.UUID, event webhook.WebhookEvent, data map[string]any) error {
	webhooks, err := s.repo.GetActiveByProjectAndEvent(ctx, projectID, event)
	if err != nil {
		return fmt.Errorf("failed to get webhooks: %w", err)
	}

	if len(webhooks) == 0 {
		return nil
	}

	payload := webhook.WebhookPayload{
		Event:     event,
		Timestamp: time.Now(),
		Data:      data,
	}

	// Send webhooks asynchronously
	for _, w := range webhooks {
		go func(webhook *webhook.Webhook) {
			delivery := &webhook.WebhookDelivery{
				WebhookID: webhook.ID,
				Event:     event,
				Payload:   mustMarshal(payload),
				Status:    webhook.DeliveryStatusPending,
			}

			if err := s.repo.CreateDelivery(context.Background(), delivery); err != nil {
				s.logger.Error("failed to create delivery record", zap.Error(err))
				return
			}

			resp, err := s.sendWebhook(context.Background(), webhook, event, payload)
			if err != nil {
				delivery.Status = webhook.DeliveryStatusFailed
				delivery.ErrorMessage = err.Error()
			} else {
				delivery.Status = webhook.DeliveryStatusDelivered
				delivery.ResponseStatus = resp.StatusCode
				delivery.ResponseBody = resp.Body
			}
			delivery.Attempts = 1
			now := time.Now()
			delivery.CompletedAt = &now

			if err := s.repo.UpdateDelivery(context.Background(), delivery); err != nil {
				s.logger.Error("failed to update delivery record", zap.Error(err))
			}
		}(w)
	}

	return nil
}

// RetryDelivery retries a failed delivery
func (s *webhookService) RetryDelivery(ctx context.Context, deliveryID uuid.UUID) error {
	delivery, err := s.repo.GetDeliveryByID(ctx, deliveryID)
	if err != nil {
		return err
	}

	if delivery.Status.IsFinalStatus() {
		return fmt.Errorf("delivery is already in final status: %s", delivery.Status)
	}

	w, err := s.repo.GetByID(ctx, delivery.WebhookID)
	if err != nil {
		return err
	}

	var payload webhook.WebhookPayload
	if err := json.Unmarshal(delivery.Payload, &payload); err != nil {
		return fmt.Errorf("failed to unmarshal payload: %w", err)
	}

	resp, err := s.sendWebhook(ctx, w, delivery.Event, payload)
	delivery.Attempts++

	if err != nil {
		delivery.ErrorMessage = err.Error()
		if delivery.Attempts >= w.RetryConfig.MaxRetries {
			delivery.Status = webhook.DeliveryStatusFailed
			now := time.Now()
			delivery.CompletedAt = &now
		} else {
			delivery.Status = webhook.DeliveryStatusRetrying
			retryAfter := time.Duration(w.RetryConfig.RetryInterval) * time.Second
			for i := 0; i < delivery.Attempts-1; i++ {
				retryAfter = time.Duration(float64(retryAfter) * w.RetryConfig.BackoffMultiplier)
			}
			nextRetry := time.Now().Add(retryAfter)
			delivery.NextRetryAt = &nextRetry
		}
	} else {
		delivery.Status = webhook.DeliveryStatusDelivered
		delivery.ResponseStatus = resp.StatusCode
		delivery.ResponseBody = resp.Body
		now := time.Now()
		delivery.CompletedAt = &now
		delivery.NextRetryAt = nil
	}

	return s.repo.UpdateDelivery(ctx, delivery)
}

// ProcessPendingDeliveries processes pending deliveries that need retry
func (s *webhookService) ProcessPendingDeliveries(ctx context.Context) error {
	deliveries, err := s.repo.GetPendingDeliveries(ctx, 100)
	if err != nil {
		return err
	}

	for _, d := range deliveries {
		if err := s.RetryDelivery(ctx, d.ID); err != nil {
			s.logger.Error("failed to retry delivery", zap.String("delivery_id", d.ID.String()), zap.Error(err))
		}
	}

	return nil
}

// webhookResponse represents the response from a webhook call
type webhookResponse struct {
	StatusCode int
	Body       string
	Headers    http.Header
}

// sendWebhook sends a webhook request
func (s *webhookService) sendWebhook(ctx context.Context, w *webhook.Webhook, event webhook.WebhookEvent, payload webhook.WebhookPayload) (*webhookResponse, error) {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, w.URL, bytes.NewReader(payloadBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Webhook-ID", w.ID.String())
	req.Header.Set("X-Event-Type", string(event))
	req.Header.Set("X-Signature", w.GenerateSignature(payloadBytes))

	// Set custom headers
	for key, value := range w.Headers {
		req.Header.Set(key, value)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send webhook: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	return &webhookResponse{
		StatusCode: resp.StatusCode,
		Body:       string(body),
		Headers:    resp.Header,
	}, nil
}

func mustMarshal(v interface{}) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}
