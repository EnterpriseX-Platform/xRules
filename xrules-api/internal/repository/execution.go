package repository

import (
	"context"
	"fmt"
	"time"

	apperrors "xrules-api/pkg/errors"
	"xrules-api/internal/domain/execution"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ExecutionRepository defines the execution repository interface
type ExecutionRepository interface {
	Create(ctx context.Context, e *execution.Execution) error
	GetByID(ctx context.Context, id uuid.UUID) (*execution.Execution, error)
	GetByRulesProject(ctx context.Context, rulesProjectID uuid.UUID, pagination Pagination) ([]*execution.Execution, int64, error)
	Update(ctx context.Context, e *execution.Execution) error
	UpdateStatus(ctx context.Context, id uuid.UUID, status execution.Status) error
	AddLog(ctx context.Context, log *execution.Log) error
	GetLogs(ctx context.Context, executionID uuid.UUID) ([]execution.Log, error)
	GetStats(ctx context.Context, rulesProjectID uuid.UUID, fromDate, toDate time.Time) (*execution.ExecutionStats, error)
	Delete(ctx context.Context, id uuid.UUID) error
	DeleteByRulesProject(ctx context.Context, rulesProjectID uuid.UUID) error
}

// executionRepository implements ExecutionRepository
type executionRepository struct {
	db *gorm.DB
}

// NewExecutionRepository creates a new execution repository
func NewExecutionRepository(db *gorm.DB) ExecutionRepository {
	return &executionRepository{db: db}
}

func (r *executionRepository) Create(ctx context.Context, e *execution.Execution) error {
	if err := r.db.WithContext(ctx).Create(e).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *executionRepository) GetByID(ctx context.Context, id uuid.UUID) (*execution.Execution, error) {
	var e execution.Execution
	if err := r.db.WithContext(ctx).First(&e, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperrors.NewNotFoundError("execution")
		}
		return nil, apperrors.NewDatabaseError(err)
	}
	return &e, nil
}

func (r *executionRepository) GetByRulesProject(ctx context.Context, rulesProjectID uuid.UUID, pagination Pagination) ([]*execution.Execution, int64, error) {
	var executions []*execution.Execution
	var total int64

	if err := r.db.WithContext(ctx).Model(&execution.Execution{}).
		Where("rules_project_id = ?", rulesProjectID).
		Count(&total).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	if err := r.db.WithContext(ctx).
		Where("rules_project_id = ?", rulesProjectID).
		Offset(pagination.Offset).
		Limit(pagination.Limit).
		Order("created_at DESC").
		Find(&executions).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	return executions, total, nil
}

func (r *executionRepository) Update(ctx context.Context, e *execution.Execution) error {
	if err := r.db.WithContext(ctx).Save(e).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *executionRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status execution.Status) error {
	if err := r.db.WithContext(ctx).
		Model(&execution.Execution{}).
		Where("id = ?", id).
		Update("status", status).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *executionRepository) AddLog(ctx context.Context, log *execution.Log) error {
	if err := r.db.WithContext(ctx).Create(log).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *executionRepository) GetLogs(ctx context.Context, executionID uuid.UUID) ([]execution.Log, error) {
	var logs []execution.Log
	if err := r.db.WithContext(ctx).
		Where("execution_id = ?", executionID).
		Order("timestamp ASC").
		Find(&logs).Error; err != nil {
		return nil, apperrors.NewDatabaseError(err)
	}
	return logs, nil
}

func (r *executionRepository) GetStats(ctx context.Context, rulesProjectID uuid.UUID, fromDate, toDate time.Time) (*execution.ExecutionStats, error) {
	stats := &execution.ExecutionStats{
		PeriodStart: fromDate,
		PeriodEnd:   toDate,
		StatusCounts: make(map[execution.Status]int64),
	}

	// Total count
	if err := r.db.WithContext(ctx).Model(&execution.Execution{}).
		Where("rules_project_id = ? AND created_at BETWEEN ? AND ?", 
			rulesProjectID, fromDate, toDate).
		Count(&stats.TotalCount).Error; err != nil {
		return nil, apperrors.NewDatabaseError(err)
	}

	// Status counts
	var statusCounts []struct {
		Status string
		Count  int64
	}
	if err := r.db.WithContext(ctx).Model(&execution.Execution{}).
		Select("status, COUNT(*) as count").
		Where("rules_project_id = ? AND created_at BETWEEN ? AND ?", 
			rulesProjectID, fromDate, toDate).
		Group("status").
		Scan(&statusCounts).Error; err != nil {
		return nil, apperrors.NewDatabaseError(err)
	}

	for _, sc := range statusCounts {
		stats.StatusCounts[execution.Status(sc.Status)] = sc.Count
	}

	// Average duration
	var avgDuration struct {
		Avg float64
	}
	if err := r.db.WithContext(ctx).Model(&execution.Execution{}).
		Select("AVG(duration) as avg").
		Where("rules_project_id = ? AND created_at BETWEEN ? AND ? AND duration > 0", 
			rulesProjectID, fromDate, toDate).
		Scan(&avgDuration).Error; err != nil {
		return nil, apperrors.NewDatabaseError(err)
	}
	stats.AvgDuration = int(avgDuration.Avg)

	// Success rate
	completedCount := stats.StatusCounts[execution.StatusCompleted]
	if stats.TotalCount > 0 {
		stats.SuccessRate = float64(completedCount) / float64(stats.TotalCount) * 100
	}

	return stats, nil
}

func (r *executionRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Delete logs first
		if err := tx.Where("execution_id = ?", id).Delete(&execution.Log{}).Error; err != nil {
			return apperrors.NewDatabaseError(err)
		}
		// Delete execution
		if err := tx.Where("id = ?", id).Delete(&execution.Execution{}).Error; err != nil {
			return apperrors.NewDatabaseError(err)
		}
		return nil
	})
}

func (r *executionRepository) DeleteByRulesProject(ctx context.Context, rulesProjectID uuid.UUID) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Get execution IDs
		var executionIDs []string
		if err := tx.Model(&execution.Execution{}).
			Where("rules_project_id = ?", rulesProjectID).
			Pluck("id", &executionIDs).Error; err != nil {
			return apperrors.NewDatabaseError(err)
		}

		// Delete logs
		if len(executionIDs) > 0 {
			if err := tx.Where("execution_id IN ?", executionIDs).Delete(&execution.Log{}).Error; err != nil {
				return apperrors.NewDatabaseError(err)
			}
		}

		// Delete executions
		if err := tx.Where("rules_project_id = ?", rulesProjectID).Delete(&execution.Execution{}).Error; err != nil {
			return apperrors.NewDatabaseError(err)
		}

		return nil
	})
}

// GetRecentExecutions gets recent executions for monitoring
func (r *executionRepository) GetRecentExecutions(ctx context.Context, limit int) ([]*execution.Execution, error) {
	var executions []*execution.Execution
	if err := r.db.WithContext(ctx).
		Order("created_at DESC").
		Limit(limit).
		Find(&executions).Error; err != nil {
		return nil, apperrors.NewDatabaseError(err)
	}
	return executions, nil
}

// SearchExecutions searches executions with filters
func (r *executionRepository) SearchExecutions(ctx context.Context, rulesProjectID uuid.UUID, status execution.Status, fromDate, toDate *time.Time, pagination Pagination) ([]*execution.Execution, int64, error) {
	var executions []*execution.Execution
	var total int64

	query := r.db.WithContext(ctx).Model(&execution.Execution{}).
		Where("rules_project_id = ?", rulesProjectID)

	if status != "" {
		query = query.Where("status = ?", status)
	}

	if fromDate != nil {
		query = query.Where("created_at >= ?", *fromDate)
	}

	if toDate != nil {
		query = query.Where("created_at <= ?", *toDate)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	if err := query.
		Offset(pagination.Offset).
		Limit(pagination.Limit).
		Order("created_at DESC").
		Find(&executions).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	return executions, total, nil
}

// CleanupOldExecutions removes old executions based on retention policy
func (r *executionRepository) CleanupOldExecutions(ctx context.Context, before time.Time) (int64, error) {
	result := r.db.WithContext(ctx).Where("created_at < ?", before).Delete(&execution.Execution{})
	if result.Error != nil {
		return 0, apperrors.NewDatabaseError(result.Error)
	}
	return result.RowsAffected, nil
}
