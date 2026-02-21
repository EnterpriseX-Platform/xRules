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
	apperrors "xrules-api/pkg/errors"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// WebhookService defines the webhook service interface
type WebhookService interface {
	// Webhook management
	RegisterWebhook(ctx context.Context, projectID uuid.UUID, req *webhook.CreateWebhookRequest) (*webhook.Webhook, error)
	GetWebhook(ctx context.Context, id uuid.UUID) (*webhook.Webhook, error)
	ListWebhooks(ctx context.Context, projectID uuid.UUID, page, limit int) (*webhook.ListWebhooksResponse, error)
	UpdateWebhook(ctx context.Context, id uuid.UUID, req *webhook.UpdateWebhookRequest) (*webhook.Webhook, error)
	DeleteWebhook(ctx context.Context, id uuid.UUID) error
	
	// Triggering
	TriggerWebhook(ctx context.Context, projectID uuid.UUID, event webhook.WebhookEvent, data map[string]any) error
	TriggerWebhookAsync(ctx context.Context, projectID uuid.UUID, event webhook.WebhookEvent, data map[string]any)
	TestWebhook(ctx context.Context, id uuid.UUID, req *webhook.TestWebhookRequest) (*webhook.TestWebhookResponse, error)
	
	// Delivery management
	GetDeliveries(ctx context.Context, webhookID uuid.UUID, req webhook.ListDeliveriesRequest) (*webhook.ListDeliveriesResponse, error)
	RetryDelivery(ctx context.Context, deliveryID uuid.UUID) error
	
	// Background tasks
	ProcessPendingDeliveries(ctx context.Context, batchSize int) error
	ProcessRetries(ctx context.Context, batchSize int) error
}

// webhookService implements WebhookService
type webhookService struct {
	webhookRepo repository.WebhookRepository
	projectRepo repository.ProjectRepository
	httpClient  *http.Client
	logger      *zap.Logger
}

// NewWebhookService creates a new webhook service
func NewWebhookService(
	webhookRepo repository.WebhookRepository,
	projectRepo repository.ProjectRepository,
	logger *zap.Logger,
) WebhookService {
	return &webhookService{
		webhookRepo: webhookRepo,
		projectRepo: projectRepo,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		logger: logger,
	}
}

// RegisterWebhook creates a new webhook
func (s *webhookService) RegisterWebhook(ctx context.Context, projectID uuid.UUID, req *webhook.CreateWebhookRequest) (*webhook.Webhook, error) {
	// Verify project exists
	if _, err := s.projectRepo.GetByID(ctx, projectID); err != nil {
		return nil, err
	}

	w := &webhook.Webhook{
		ProjectID: projectID,
		Name:      req.Name,
		URL:       req.URL,
		Events:    req.Events,
		Headers:   req.Headers,
		Active:    req.Active,
	}

	// Set secret if provided
	if req.Secret != "" {
		w.Secret = req.Secret
	}

	// Set retry config if provided
	if req.RetryConfig != nil {
		w.RetryConfig = *req.RetryConfig
	}

	if err := s.webhookRepo.Create(ctx, w); err != nil {
		return nil, err
	}

	s.logger.Info("Webhook registered",
		zap.String("webhook_id", w.ID.String()),
		zap.String("project_id", projectID.String()),
		zap.String("url", w.URL),
	)

	return w, nil
}

// GetWebhook retrieves a webhook by ID
func (s *webhookService) GetWebhook(ctx context.Context, id uuid.UUID) (*webhook.Webhook, error) {
	return s.webhookRepo.GetByID(ctx, id)
}

// ListWebhooks lists webhooks for a project
func (s *webhookService) ListWebhooks(ctx context.Context, projectID uuid.UUID, page, limit int) (*webhook.ListWebhooksResponse, error) {
	pagination := repository.NewPagination(page, limit)

	webhooks, total, err := s.webhookRepo.GetByProject(ctx, projectID, pagination)
	if err != nil {
		return nil, err
	}

	responses := make([]*webhook.WebhookResponse, len(webhooks))
	for i, w := range webhooks {
		responses[i] = w.ToResponse()
	}

	totalPages := int(total) / limit
	if int(total)%limit > 0 {
		totalPages++
	}

	return &webhook.ListWebhooksResponse{
		Data:       responses,
		Total:      total,
		Page:       page,
		Limit:      limit,
		TotalPages: totalPages,
	}, nil
}

// UpdateWebhook updates a webhook
func (s *webhookService) UpdateWebhook(ctx context.Context, id uuid.UUID, req *webhook.UpdateWebhookRequest) (*webhook.Webhook, error) {
	w, err := s.webhookRepo.GetByID(ctx, id)
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

	if err := s.webhookRepo.Update(ctx, w); err != nil {
		return nil, err
	}

	s.logger.Info("Webhook updated",
		zap.String("webhook_id", w.ID.String()),
	)

	return w, nil
}

// DeleteWebhook deletes a webhook
func (s *webhookService) DeleteWebhook(ctx context.Context, id uuid.UUID) error {
	if _, err := s.webhookRepo.GetByID(ctx, id); err != nil {
		return err
	}

	if err := s.webhookRepo.Delete(ctx, id); err != nil {
		return err
	}

	s.logger.Info("Webhook deleted",
		zap.String("webhook_id", id.String()),
	)

	return nil
}

// TriggerWebhook triggers webhooks for a specific event (synchronous)
func (s *webhookService) TriggerWebhook(ctx context.Context, projectID uuid.UUID, event webhook.WebhookEvent, data map[string]any) error {
	webhooks, err := s.webhookRepo.GetByProjectAndEvent(ctx, projectID, event)
	if err != nil {
		return err
	}

	if len(webhooks) == 0 {
		return nil // No webhooks to trigger
	}

	payload := &webhook.WebhookPayload{
		Event:     event,
		Timestamp: time.Now().UTC(),
		Data:      data,
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return apperrors.NewInternalError(err)
	}

	// Create delivery records and send to each webhook
	for _, w := range webhooks {
		if !w.Active {
			continue
		}

		delivery := &webhook.WebhookDelivery{
			WebhookID: w.ID,
			Event:     event,
			Payload:   payloadBytes,
			Status:    webhook.DeliveryStatusPending,
		}

		if err := s.webhookRepo.CreateDelivery(ctx, delivery); err != nil {
			s.logger.Error("Failed to create delivery record",
				zap.Error(err),
				zap.String("webhook_id", w.ID.String()),
			)
			continue
		}

		// Send the webhook
		s.sendWebhook(ctx, w, delivery, payloadBytes)
	}

	return nil
}

// TriggerWebhookAsync triggers webhooks asynchronously
func (s *webhookService) TriggerWebhookAsync(ctx context.Context, projectID uuid.UUID, event webhook.WebhookEvent, data map[string]any) {
	go func() {
		// Create a new context with timeout for the async operation
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()

		if err := s.TriggerWebhook(ctx, projectID, event, data); err != nil {
			s.logger.Error("Failed to trigger webhooks async",
				zap.Error(err),
				zap.String("project_id", projectID.String()),
				zap.String("event", string(event)),
			)
		}
	}()
}

// sendWebhook sends a webhook delivery
func (s *webhookService) sendWebhook(ctx context.Context, w *webhook.Webhook, delivery *webhook.WebhookDelivery, payload []byte) {
	// Generate signature
	signature := w.GenerateSignature(payload)

	// Create request
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, w.URL, bytes.NewReader(payload))
	if err != nil {
		s.updateDeliveryFailed(ctx, delivery, err.Error())
		return
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Webhook-Signature", signature)
	req.Header.Set("X-Webhook-ID", delivery.ID.String())
	req.Header.Set("X-Webhook-Event", string(delivery.Event))
	req.Header.Set("User-Agent", "xrules-webhook/1.0")

	// Set custom headers
	for key, value := range w.Headers {
		req.Header.Set(key, value)
	}

	// Store request headers
	headersJSON, _ := json.Marshal(req.Header)
	delivery.RequestHeaders = headersJSON
	delivery.Attempts++

	// Send request with timeout
	httpClient := &http.Client{
		Timeout: time.Duration(w.RetryConfig.TimeoutSeconds) * time.Second,
	}

	start := time.Now()
	resp, err := httpClient.Do(req)
	latency := time.Since(start)

	if err != nil {
		delivery.ErrorMessage = err.Error()
		s.handleDeliveryFailure(ctx, w, delivery)
		return
	}
	defer resp.Body.Close()

	// Read response body
	body, _ := io.ReadAll(resp.Body)
	delivery.ResponseStatus = resp.StatusCode
	delivery.ResponseBody = string(body)

	// Check if successful (2xx status codes)
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		delivery.Status = webhook.DeliveryStatusDelivered
		now := time.Now()
		delivery.CompletedAt = &now
		delivery.ErrorMessage = ""

		s.logger.Info("Webhook delivered successfully",
			zap.String("webhook_id", w.ID.String()),
			zap.String("delivery_id", delivery.ID.String()),
			zap.Int("status_code", resp.StatusCode),
			zap.Duration("latency", latency),
		)
	} else {
		delivery.ErrorMessage = fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(body))
		s.handleDeliveryFailure(ctx, w, delivery)
	}

	// Update delivery record
	if err := s.webhookRepo.UpdateDelivery(ctx, delivery); err != nil {
		s.logger.Error("Failed to update delivery record",
			zap.Error(err),
			zap.String("delivery_id", delivery.ID.String()),
		)
	}
}

// handleDeliveryFailure handles failed deliveries and schedules retries
func (s *webhookService) handleDeliveryFailure(ctx context.Context, w *webhook.Webhook, delivery *webhook.WebhookDelivery) {
	if delivery.Attempts < w.RetryConfig.MaxRetries {
		// Schedule retry with exponential backoff
		backoff := time.Duration(float64(w.RetryConfig.RetryInterval) * 
			pow(w.RetryConfig.BackoffMultiplier, float64(delivery.Attempts-1)))
		nextRetry := time.Now().Add(backoff * time.Second)
		delivery.NextRetryAt = &nextRetry
		delivery.Status = webhook.DeliveryStatusRetrying

		s.logger.Warn("Webhook delivery failed, scheduling retry",
			zap.String("webhook_id", w.ID.String()),
			zap.String("delivery_id", delivery.ID.String()),
			zap.Int("attempt", delivery.Attempts),
			zap.Int("max_retries", w.RetryConfig.MaxRetries),
			zap.Duration("next_retry_in", backoff*time.Second),
		)
	} else {
		// Max retries exceeded
		delivery.Status = webhook.DeliveryStatusFailed
		now := time.Now()
		delivery.CompletedAt = &now

		s.logger.Error("Webhook delivery failed after max retries",
			zap.String("webhook_id", w.ID.String()),
			zap.String("delivery_id", delivery.ID.String()),
			zap.Int("attempts", delivery.Attempts),
		)
	}
}

// updateDeliveryFailed updates delivery with failure status
func (s *webhookService) updateDeliveryFailed(ctx context.Context, delivery *webhook.WebhookDelivery, errorMsg string) {
	delivery.Status = webhook.DeliveryStatusFailed
	delivery.ErrorMessage = errorMsg
	now := time.Now()
	delivery.CompletedAt = &now

	if err := s.webhookRepo.UpdateDelivery(ctx, delivery); err != nil {
		s.logger.Error("Failed to update delivery record",
			zap.Error(err),
			zap.String("delivery_id", delivery.ID.String()),
		)
	}
}

// TestWebhook tests a webhook by sending a test event
func (s *webhookService) TestWebhook(ctx context.Context, id uuid.UUID, req *webhook.TestWebhookRequest) (*webhook.TestWebhookResponse, error) {
	w, err := s.webhookRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Use provided event or default to a test event
	event := req.Event
	if event == "" {
		event = webhook.EventRuleExecuted
	}

	// Build test payload
	payload := &webhook.WebhookPayload{
		Event:     event,
		Timestamp: time.Now().UTC(),
		Data: map[string]any{
			"test":    true,
			"message": "This is a test webhook event",
			"webhook": map[string]any{
				"id":   w.ID.String(),
				"name": w.Name,
				"url":  w.URL,
			},
		},
	}

	// Add custom data if provided
	if req.Payload != nil {
		for key, value := range req.Payload {
			payload.Data[key] = value
		}
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, apperrors.NewInternalError(err)
	}

	// Generate signature
	signature := w.GenerateSignature(payloadBytes)

	// Create request
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, w.URL, bytes.NewReader(payloadBytes))
	if err != nil {
		return &webhook.TestWebhookResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}

	// Set headers
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Webhook-Signature", signature)
	httpReq.Header.Set("X-Webhook-Event", string(event))
	httpReq.Header.Set("X-Webhook-Test", "true")
	httpReq.Header.Set("User-Agent", "xrules-webhook/1.0")

	// Set custom headers
	for key, value := range w.Headers {
		httpReq.Header.Set(key, value)
	}

	// Send with timeout
	httpClient := &http.Client{
		Timeout: 30 * time.Second,
	}

	start := time.Now()
	resp, err := httpClient.Do(httpReq)
	latency := time.Since(start).Milliseconds()

	if err != nil {
		return &webhook.TestWebhookResponse{
			Success:   false,
			LatencyMs: latency,
			Error:     err.Error(),
		}, nil
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	return &webhook.TestWebhookResponse{
		Success:        resp.StatusCode >= 200 && resp.StatusCode < 300,
		ResponseStatus: resp.StatusCode,
		ResponseBody:   string(body),
		LatencyMs:      latency,
	}, nil
}

// GetDeliveries retrieves deliveries for a webhook
func (s *webhookService) GetDeliveries(ctx context.Context, webhookID uuid.UUID, req webhook.ListDeliveriesRequest) (*webhook.ListDeliveriesResponse, error) {
	deliveries, total, err := s.webhookRepo.GetDeliveriesByWebhook(ctx, webhookID, req)
	if err != nil {
		return nil, err
	}

	responses := make([]*webhook.DeliveryResponse, len(deliveries))
	for i, d := range deliveries {
		responses[i] = d.ToResponse()
	}

	totalPages := int(total) / req.Limit
	if int(total)%req.Limit > 0 {
		totalPages++
	}

	return &webhook.ListDeliveriesResponse{
		Data:       responses,
		Total:      total,
		Page:       req.Page,
		Limit:      req.Limit,
		TotalPages: totalPages,
	}, nil
}

// RetryDelivery retries a failed delivery
func (s *webhookService) RetryDelivery(ctx context.Context, deliveryID uuid.UUID) error {
	delivery, err := s.webhookRepo.GetDeliveryByID(ctx, deliveryID)
	if err != nil {
		return err
	}

	if !delivery.Status.IsFinalStatus() {
		return apperrors.NewBadRequestError("delivery is not in a final status")
	}

	// Get the webhook
	w, err := s.webhookRepo.GetByID(ctx, delivery.WebhookID)
	if err != nil {
		return err
	}

	if !w.Active {
		return apperrors.NewBadRequestError("webhook is inactive")
	}

	// Reset delivery status
	delivery.Status = webhook.DeliveryStatusPending
	delivery.Attempts = 0
	delivery.ErrorMessage = ""
	delivery.ResponseStatus = 0
	delivery.ResponseBody = ""
	delivery.NextRetryAt = nil
	delivery.CompletedAt = nil

	if err := s.webhookRepo.UpdateDelivery(ctx, delivery); err != nil {
		return err
	}

	// Send the webhook
	s.sendWebhook(ctx, w, delivery, delivery.Payload)

	return nil
}

// ProcessPendingDeliveries processes pending deliveries in batch
func (s *webhookService) ProcessPendingDeliveries(ctx context.Context, batchSize int) error {
	deliveries, err := s.webhookRepo.GetPendingDeliveries(ctx, batchSize)
	if err != nil {
		return err
	}

	for _, delivery := range deliveries {
		w, err := s.webhookRepo.GetByID(ctx, delivery.WebhookID)
		if err != nil {
			s.logger.Error("Failed to get webhook for delivery",
				zap.Error(err),
				zap.String("webhook_id", delivery.WebhookID.String()),
			)
			continue
		}

		if !w.Active {
			// Mark as failed if webhook is inactive
			delivery.Status = webhook.DeliveryStatusFailed
			delivery.ErrorMessage = "webhook is inactive"
			now := time.Now()
			delivery.CompletedAt = &now
			s.webhookRepo.UpdateDelivery(ctx, delivery)
			continue
		}

		s.sendWebhook(ctx, w, delivery, delivery.Payload)
	}

	return nil
}

// ProcessRetries processes deliveries that need to be retried
func (s *webhookService) ProcessRetries(ctx context.Context, batchSize int) error {
	deliveries, err := s.webhookRepo.GetDeliveriesForRetry(ctx, batchSize)
	if err != nil {
		return err
	}

	for _, delivery := range deliveries {
		w, err := s.webhookRepo.GetByID(ctx, delivery.WebhookID)
		if err != nil {
			s.logger.Error("Failed to get webhook for retry",
				zap.Error(err),
				zap.String("webhook_id", delivery.WebhookID.String()),
			)
			continue
		}

		if !w.Active {
			continue
		}

		s.sendWebhook(ctx, w, delivery, delivery.Payload)
	}

	return nil
}

// pow calculates x raised to the power of y
func pow(x, y float64) float64 {
	result := 1.0
	for i := 0; i < int(y); i++ {
		result *= x
	}
	return result
}
