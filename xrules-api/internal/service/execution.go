package service

import (
	"context"
	"time"

	"xrules-api/internal/domain/execution"
	"xrules-api/internal/domain/rules"
	"xrules-api/internal/infra/cache"
	"xrules-api/internal/repository"
	apperrors "xrules-api/pkg/errors"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// ExecutionService defines the execution service interface
type ExecutionService interface {
	GetByID(ctx context.Context, id uuid.UUID) (*execution.Execution, error)
	GetByRulesProject(ctx context.Context, rulesProjectID uuid.UUID, status execution.Status, fromDate, toDate *time.Time, page, limit int) (*execution.ListExecutionsResponse, error)
	GetLogs(ctx context.Context, executionID uuid.UUID) ([]execution.LogResponse, error)
	GetStats(ctx context.Context, rulesProjectID uuid.UUID, fromDate, toDate time.Time) (*execution.ExecutionStats, error)
	Cancel(ctx context.Context, id uuid.UUID, userID uuid.UUID) error
	Delete(ctx context.Context, id uuid.UUID, userID uuid.UUID) error
}

// executionService implements ExecutionService
type executionService struct {
	executionRepo repository.ExecutionRepository
	rulesRepo     repository.RulesRepository
	cache         *cache.Cache
	logger        *zap.Logger
}

// NewExecutionService creates a new execution service
func NewExecutionService(executionRepo repository.ExecutionRepository, rulesRepo repository.RulesRepository, cache *cache.Cache, logger *zap.Logger) ExecutionService {
	return &executionService{
		executionRepo: executionRepo,
		rulesRepo:     rulesRepo,
		cache:         cache,
		logger:        logger,
	}
}

func (s *executionService) GetByID(ctx context.Context, id uuid.UUID) (*execution.Execution, error) {
	e, err := s.executionRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Get log count
	logs, err := s.executionRepo.GetLogs(ctx, id)
	if err != nil {
		s.logger.Warn("Failed to get execution logs", zap.Error(err))
	}
	e.Logs = logs

	return e, nil
}

func (s *executionService) GetByRulesProject(ctx context.Context, rulesProjectID uuid.UUID, status execution.Status, fromDate, toDate *time.Time, page, limit int) (*execution.ListExecutionsResponse, error) {
	pagination := repository.NewPagination(page, limit)

	executions, total, err := s.executionRepo.SearchExecutions(ctx, rulesProjectID, status, fromDate, toDate, pagination)
	if err != nil {
		return nil, err
	}

	responses := make([]*execution.ExecutionResponse, len(executions))
	for i, e := range executions {
		responses[i] = e.ToResponse()
	}

	totalPages := int(total) / limit
	if int(total)%limit > 0 {
		totalPages++
	}

	return &execution.ListExecutionsResponse{
		Data:       responses,
		Total:      total,
		Page:       page,
		Limit:      limit,
		TotalPages: totalPages,
	}, nil
}

func (s *executionService) GetLogs(ctx context.Context, executionID uuid.UUID) ([]execution.LogResponse, error) {
	logs, err := s.executionRepo.GetLogs(ctx, executionID)
	if err != nil {
		return nil, err
	}

	responses := make([]execution.LogResponse, len(logs))
	for i, log := range logs {
		responses[i] = *log.ToResponse()
	}

	return responses, nil
}

func (s *executionService) GetStats(ctx context.Context, rulesProjectID uuid.UUID, fromDate, toDate time.Time) (*execution.ExecutionStats, error) {
	return s.executionRepo.GetStats(ctx, rulesProjectID, fromDate, toDate)
}

func (s *executionService) Cancel(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	e, err := s.executionRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	// Check if execution can be cancelled
	if !e.IsActive() {
		return apperrors.NewBadRequestError("execution is not active")
	}

	// In production, you would check permissions here
	// For now, we allow cancellation by anyone

	e.Cancel()
	return s.executionRepo.Update(ctx, e)
}

func (s *executionService) Delete(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	// Check if execution exists
	_, err := s.executionRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	return s.executionRepo.Delete(ctx, id)
}

// AddLog adds a log entry to an execution
func (s *executionService) AddLog(ctx context.Context, executionID uuid.UUID, level execution.LogLevel, nodeID, message string, data execution.LogData) error {
	log := &execution.Log{
		ExecutionID: executionID,
		Level:       level,
		NodeID:      nodeID,
		Message:     message,
		Data:        data,
		Timestamp:   time.Now(),
	}

	return s.executionRepo.AddLog(ctx, log)
}

// UpdateExecutionStatus updates the status of an execution
func (s *executionService) UpdateExecutionStatus(ctx context.Context, id uuid.UUID, status execution.Status) error {
	return s.executionRepo.UpdateStatus(ctx, id, status)
}

// CreateExecution creates a new execution
func (s *executionService) CreateExecution(ctx context.Context, rulesProjectID uuid.UUID, input execution.Input, ctxData execution.Context, createdBy uuid.UUID) (*execution.Execution, error) {
	// Verify rules project exists and is active
	rp, err := s.rulesRepo.GetByID(ctx, rulesProjectID)
	if err != nil {
		return nil, err
	}

	if rp.Status != rules.StatusActive {
		return nil, apperrors.NewBadRequestError("rules project is not active")
	}

	e := &execution.Execution{
		RulesProjectID: rulesProjectID,
		Status:         execution.StatusPending,
		Input:          input,
		Context:        ctxData,
		NodeResults:    make(execution.NodeResults),
		CreatedBy:      createdBy,
	}

	if err := s.executionRepo.Create(ctx, e); err != nil {
		return nil, err
	}

	return e, nil
}

// StreamExecution streams execution updates (placeholder for WebSocket/SSE)
func (s *executionService) StreamExecution(ctx context.Context, executionID uuid.UUID, ch chan<- *execution.Execution) error {
	// This is a placeholder for streaming execution updates
	// In production, this would use WebSocket or Server-Sent Events
	
	e, err := s.executionRepo.GetByID(ctx, executionID)
	if err != nil {
		return err
	}

	ch <- e
	return nil
}

// CleanupOldExecutions removes executions older than the retention period
func (s *executionService) CleanupOldExecutions(ctx context.Context, retentionDays int) (int64, error) {
	cutoff := time.Now().AddDate(0, 0, -retentionDays)
	return s.executionRepo.CleanupOldExecutions(ctx, cutoff)
}
