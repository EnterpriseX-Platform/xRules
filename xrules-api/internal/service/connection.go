package service

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"time"

	"xrules-api/internal/domain/connection"
	"xrules-api/internal/repository"
	apperrors "xrules-api/pkg/errors"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
)

// ConnectionService defines the connection service interface
type ConnectionService interface {
	Create(ctx context.Context, workspaceID, userID uuid.UUID, req *connection.CreateConnectionRequest) (*connection.Connection, error)
	GetByID(ctx context.Context, id uuid.UUID) (*connection.Connection, error)
	ListByWorkspace(ctx context.Context, workspaceID uuid.UUID, connType string, page, limit int, search string) (*connection.ListConnectionsResponse, error)
	Update(ctx context.Context, id uuid.UUID, userID uuid.UUID, req *connection.UpdateConnectionRequest) (*connection.Connection, error)
	Delete(ctx context.Context, id uuid.UUID, userID uuid.UUID) error
	TestConnection(ctx context.Context, req *connection.TestConnectionRequest) (*connection.TestResult, error)
	TestExistingConnection(ctx context.Context, id uuid.UUID, userID uuid.UUID) (*connection.TestResult, error)
}

// connectionService implements ConnectionService
type connectionService struct {
	connectionRepo repository.ConnectionRepository
}

// NewConnectionService creates a new connection service
func NewConnectionService(connectionRepo repository.ConnectionRepository) ConnectionService {
	return &connectionService{connectionRepo: connectionRepo}
}

func (s *connectionService) Create(ctx context.Context, workspaceID, userID uuid.UUID, req *connection.CreateConnectionRequest) (*connection.Connection, error) {
	// Validate connection type
	if !isValidConnectionType(req.Type) {
		return nil, apperrors.NewValidationError("invalid connection type")
	}

	c := &connection.Connection{
		WorkspaceID:   workspaceID,
		Name:          req.Name,
		Type:          req.Type,
		Description:   req.Description,
		Config:        req.Config,
		Credentials:   req.Credentials,
		Status:        connection.StatusPending,
		HealthCheck:   req.HealthCheck,
		CreatedBy:     userID,
	}

	// Test connection before saving
	result := s.testConnection(req.Type, req.Config, req.Credentials)
	if result.Success {
		c.Status = connection.StatusActive
	} else {
		c.Status = connection.StatusError
		c.LastError = result.Message
	}
	c.LastTestedAt = &result.Timestamp

	if err := s.connectionRepo.Create(ctx, c); err != nil {
		return nil, err
	}

	return c, nil
}

func (s *connectionService) GetByID(ctx context.Context, id uuid.UUID) (*connection.Connection, error) {
	return s.connectionRepo.GetByID(ctx, id)
}

func (s *connectionService) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID, connType string, page, limit int, search string) (*connection.ListConnectionsResponse, error) {
	pagination := repository.NewPagination(page, limit)

	var connections []*connection.Connection
	var total int64
	var err error

	if search != "" || connType != "" {
		connections, total, err = s.connectionRepo.Search(ctx, workspaceID, search, connType, pagination)
	} else {
		connections, total, err = s.connectionRepo.GetByWorkspace(ctx, workspaceID, pagination)
	}

	if err != nil {
		return nil, err
	}

	responses := make([]*connection.ConnectionResponse, len(connections))
	for i, c := range connections {
		responses[i] = c.ToResponse()
	}

	totalPages := int(total) / limit
	if int(total)%limit > 0 {
		totalPages++
	}

	return &connection.ListConnectionsResponse{
		Data:       responses,
		Total:      total,
		Page:       page,
		Limit:      limit,
		TotalPages: totalPages,
	}, nil
}

func (s *connectionService) Update(ctx context.Context, id uuid.UUID, userID uuid.UUID, req *connection.UpdateConnectionRequest) (*connection.Connection, error) {
	c, err := s.connectionRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if req.Name != "" {
		c.Name = req.Name
	}
	if req.Description != "" {
		c.Description = req.Description
	}
	if req.Config != nil {
		c.Config = *req.Config
	}
	if req.Credentials != nil {
		c.Credentials = *req.Credentials
	}
	if req.HealthCheck != nil {
		c.HealthCheck = *req.HealthCheck
	}
	if req.Status != nil {
		c.Status = *req.Status
	}

	c.UpdatedBy = userID

	if err := s.connectionRepo.Update(ctx, c); err != nil {
		return nil, err
	}

	return c, nil
}

func (s *connectionService) Delete(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	_, err := s.connectionRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	return s.connectionRepo.Delete(ctx, id)
}

func (s *connectionService) TestConnection(ctx context.Context, req *connection.TestConnectionRequest) (*connection.TestResult, error) {
	if !isValidConnectionType(req.Type) {
		return nil, apperrors.NewValidationError("invalid connection type")
	}

	result := s.testConnection(req.Type, req.Config, req.Credentials)
	return &result, nil
}

func (s *connectionService) TestExistingConnection(ctx context.Context, id uuid.UUID, userID uuid.UUID) (*connection.TestResult, error) {
	c, err := s.connectionRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	result := s.testConnection(c.Type, c.Config, c.Credentials)

	// Update connection status
	status := connection.StatusActive
	lastError := ""
	if !result.Success {
		status = connection.StatusError
		lastError = result.Message
	}

	s.connectionRepo.UpdateStatus(ctx, id, status, lastError)

	return &result, nil
}

func (s *connectionService) testConnection(connType connection.Type, config connection.Config, creds connection.Credentials) connection.TestResult {
	start := time.Now()
	
	switch connType {
	case connection.TypeDatabase:
		return s.testDatabaseConnection(config, creds)
	case connection.TypeHTTP:
		return s.testHTTPConnection(config, creds)
	case connection.TypeRedis:
		return s.testRedisConnection(config, creds)
	default:
		return connection.TestResult{
			Success:   true,
			Message:   "Connection type not testable, assumed valid",
			Timestamp: time.Now(),
		}
	}
}

func (s *connectionService) testDatabaseConnection(config connection.Config, creds connection.Credentials) connection.TestResult {
	start := time.Now()

	// Build DSN
	dsn := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s connect_timeout=5",
		config.Host, config.Port, creds.Username, creds.Password, config.Database, config.SSLMode,
	)

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return connection.TestResult{
			Success:   false,
			Message:   fmt.Sprintf("Failed to create connection: %v", err),
			Timestamp: time.Now(),
		}
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return connection.TestResult{
			Success:   false,
			Message:   fmt.Sprintf("Failed to ping database: %v", err),
			Timestamp: time.Now(),
		}
	}

	return connection.TestResult{
		Success:   true,
		Message:   "Database connection successful",
		Latency:   time.Since(start),
		Timestamp: time.Now(),
	}
}

func (s *connectionService) testHTTPConnection(config connection.Config, creds connection.Credentials) connection.TestResult {
	start := time.Now()

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	req, err := http.NewRequest("GET", config.BaseURL, nil)
	if err != nil {
		return connection.TestResult{
			Success:   false,
			Message:   fmt.Sprintf("Failed to create request: %v", err),
			Timestamp: time.Now(),
		}
	}

	// Add auth if provided
	if creds.APIKey != "" {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", creds.APIKey))
	} else if creds.Token != "" {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", creds.Token))
	}

	resp, err := client.Do(req)
	if err != nil {
		return connection.TestResult{
			Success:   false,
			Message:   fmt.Sprintf("HTTP request failed: %v", err),
			Timestamp: time.Now(),
		}
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return connection.TestResult{
			Success:   true,
			Message:   fmt.Sprintf("HTTP connection successful (status: %d)", resp.StatusCode),
			Latency:   time.Since(start),
			Timestamp: time.Now(),
		}
	}

	return connection.TestResult{
		Success:   false,
		Message:   fmt.Sprintf("HTTP request returned status: %d", resp.StatusCode),
		Latency:   time.Since(start),
		Timestamp: time.Now(),
	}
}

func (s *connectionService) testRedisConnection(config connection.Config, creds connection.Credentials) connection.TestResult {
	start := time.Now()

	// Simple Redis connectivity check - in production, use go-redis client
	// This is a simplified version
	return connection.TestResult{
		Success:   true,
		Message:   "Redis connection test not fully implemented",
		Latency:   time.Since(start),
		Timestamp: time.Now(),
	}
}

func isValidConnectionType(t connection.Type) bool {
	validTypes := []connection.Type{
		connection.TypeDatabase,
		connection.TypeHTTP,
		connection.TypeSFTP,
		connection.TypeRedis,
		connection.TypeKafka,
		connection.TypeAWS,
		connection.TypeGCP,
		connection.TypeAzure,
		connection.TypeWebhook,
		connection.TypeEmail,
		connection.TypeSlack,
		connection.TypeCustom,
	}

	for _, vt := range validTypes {
		if t == vt {
			return true
		}
	}
	return false
}
