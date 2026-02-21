package handlers

import (
	"net/http"

	"xrules-api/internal/domain/webhook"
	"xrules-api/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// WebhookHandler handles webhook-related requests
type WebhookHandler struct {
	webhookService service.WebhookService
}

// NewWebhookHandler creates a new webhook handler
func NewWebhookHandler(webhookService service.WebhookService) *WebhookHandler {
	return &WebhookHandler{
		webhookService: webhookService,
	}
}

// CreateWebhook godoc
// @Summary Create a new webhook
// @Description Create a new webhook for a project
// @Tags webhooks
// @Accept json
// @Produce json
// @Param project_id path string true "Project ID"
// @Param request body webhook.CreateWebhookRequest true "Webhook configuration"
// @Success 201 {object} webhook.WebhookResponse
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Router /projects/{project_id}/webhooks [post]
func (h *WebhookHandler) CreateWebhook(c *gin.Context) {
	projectID, err := uuid.Parse(c.Param("project_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project id"})
		return
	}

	var req webhook.CreateWebhookRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	w, err := h.webhookService.CreateWebhook(c.Request.Context(), projectID, &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, w.ToResponse())
}

// ListWebhooks godoc
// @Summary List webhooks
// @Description List all webhooks for a project
// @Tags webhooks
// @Produce json
// @Param project_id path string true "Project ID"
// @Param page query int false "Page number" default(1)
// @Param limit query int false "Items per page" default(20)
// @Success 200 {object} webhook.ListWebhooksResponse
// @Failure 400 {object} map[string]string
// @Router /projects/{project_id}/webhooks [get]
func (h *WebhookHandler) ListWebhooks(c *gin.Context) {
	projectID, err := uuid.Parse(c.Param("project_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project id"})
		return
	}

	page := 1
	limit := 20
	if p := c.Query("page"); p != "" {
		if parsed, err := uuid.Parse(p); err == nil {
			_ = parsed
			page = 1
		}
	}

	resp, err := h.webhookService.ListWebhooks(c.Request.Context(), projectID, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// GetWebhook godoc
// @Summary Get webhook details
// @Description Get details of a specific webhook
// @Tags webhooks
// @Produce json
// @Param id path string true "Webhook ID"
// @Success 200 {object} webhook.WebhookResponse
// @Failure 404 {object} map[string]string
// @Router /webhooks/{id} [get]
func (h *WebhookHandler) GetWebhook(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid webhook id"})
		return
	}

	w, err := h.webhookService.GetWebhook(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, w.ToResponse())
}

// UpdateWebhook godoc
// @Summary Update webhook
// @Description Update a webhook configuration
// @Tags webhooks
// @Accept json
// @Produce json
// @Param id path string true "Webhook ID"
// @Param request body webhook.UpdateWebhookRequest true "Webhook updates"
// @Success 200 {object} webhook.WebhookResponse
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /webhooks/{id} [put]
func (h *WebhookHandler) UpdateWebhook(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid webhook id"})
		return
	}

	var req webhook.UpdateWebhookRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	w, err := h.webhookService.UpdateWebhook(c.Request.Context(), id, &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, w.ToResponse())
}

// DeleteWebhook godoc
// @Summary Delete webhook
// @Description Delete a webhook
// @Tags webhooks
// @Param id path string true "Webhook ID"
// @Success 204
// @Failure 400 {object} map[string]string
// @Router /webhooks/{id} [delete]
func (h *WebhookHandler) DeleteWebhook(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid webhook id"})
		return
	}

	if err := h.webhookService.DeleteWebhook(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}

// TestWebhook godoc
// @Summary Test webhook
// @Description Send a test event to a webhook
// @Tags webhooks
// @Accept json
// @Produce json
// @Param id path string true "Webhook ID"
// @Param request body webhook.TestWebhookRequest false "Test configuration"
// @Success 200 {object} webhook.TestWebhookResponse
// @Failure 400 {object} map[string]string
// @Router /webhooks/{id}/test [post]
func (h *WebhookHandler) TestWebhook(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid webhook id"})
		return
	}

	var req webhook.TestWebhookRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := h.webhookService.TestWebhook(c.Request.Context(), id, &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// ListDeliveries godoc
// @Summary List webhook deliveries
// @Description List delivery attempts for a webhook
// @Tags webhooks
// @Produce json
// @Param id path string true "Webhook ID"
// @Param page query int false "Page number" default(1)
// @Param limit query int false "Items per page" default(20)
// @Success 200 {object} webhook.ListDeliveriesResponse
// @Failure 400 {object} map[string]string
// @Router /webhooks/{id}/deliveries [get]
func (h *WebhookHandler) ListDeliveries(c *gin.Context) {
	webhookID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid webhook id"})
		return
	}

	page := 1
	if p := c.Query("page"); p != "" {
		// Parse page number
	}
	limit := 20
	if l := c.Query("limit"); l != "" {
		// Parse limit
	}

	resp, err := h.webhookService.ListDeliveries(c.Request.Context(), webhookID, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// GetDelivery godoc
// @Summary Get delivery details
// @Description Get details of a specific delivery
// @Tags webhooks
// @Produce json
// @Param id path string true "Delivery ID"
// @Success 200 {object} webhook.DeliveryResponse
// @Failure 404 {object} map[string]string
// @Router /webhooks/deliveries/{id} [get]
func (h *WebhookHandler) GetDelivery(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid delivery id"})
		return
	}

	delivery, err := h.webhookService.GetDelivery(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, delivery.ToResponse())
}

// RetryDelivery godoc
// @Summary Retry delivery
// @Description Retry a failed webhook delivery
// @Tags webhooks
// @Param id path string true "Delivery ID"
// @Success 200 {object} map[string]string
// @Failure 400 {object} map[string]string
// @Router /webhooks/deliveries/{id}/retry [post]
func (h *WebhookHandler) RetryDelivery(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid delivery id"})
		return
	}

	if err := h.webhookService.RetryDelivery(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "delivery retry initiated"})
}

// GetWebhookEvents godoc
// @Summary Get available webhook events
// @Description Get list of all available webhook event types
// @Tags webhooks
// @Produce json
// @Success 200 {array} string
// @Router /webhooks/events [get]
func (h *WebhookHandler) GetWebhookEvents(c *gin.Context) {
	events := webhook.AllWebhookEvents()
	eventStrings := make([]string, len(events))
	for i, e := range events {
		eventStrings[i] = string(e)
	}
	c.JSON(http.StatusOK, eventStrings)
}
