package repository

import (
	"context"
	"fmt"

	apperrors "xrules-api/pkg/errors"
	"xrules-api/internal/domain/connection"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ConnectionRepository defines the connection repository interface
type ConnectionRepository interface {
	Create(ctx context.Context, c *connection.Connection) error
	GetByID(ctx context.Context, id uuid.UUID) (*connection.Connection, error)
	GetByWorkspace(ctx context.Context, workspaceID uuid.UUID, pagination Pagination) ([]*connection.Connection, int64, error)
	GetByWorkspaceAndType(ctx context.Context, workspaceID uuid.UUID, connType connection.Type, pagination Pagination) ([]*connection.Connection, int64, error)
	Update(ctx context.Context, c *connection.Connection) error
	UpdateStatus(ctx context.Context, id uuid.UUID, status connection.Status, lastError string) error
	Delete(ctx context.Context, id uuid.UUID) error
	Search(ctx context.Context, workspaceID uuid.UUID, search string, connType string, pagination Pagination) ([]*connection.Connection, int64, error)
	CountByWorkspace(ctx context.Context, workspaceID uuid.UUID) (int64, error)
}

// connectionRepository implements ConnectionRepository
type connectionRepository struct {
	db *gorm.DB
}

// NewConnectionRepository creates a new connection repository
func NewConnectionRepository(db *gorm.DB) ConnectionRepository {
	return &connectionRepository{db: db}
}

func (r *connectionRepository) Create(ctx context.Context, c *connection.Connection) error {
	if err := r.db.WithContext(ctx).Create(c).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *connectionRepository) GetByID(ctx context.Context, id uuid.UUID) (*connection.Connection, error) {
	var c connection.Connection
	if err := r.db.WithContext(ctx).First(&c, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperrors.NewNotFoundError("connection")
		}
		return nil, apperrors.NewDatabaseError(err)
	}
	return &c, nil
}

func (r *connectionRepository) GetByWorkspace(ctx context.Context, workspaceID uuid.UUID, pagination Pagination) ([]*connection.Connection, int64, error) {
	var connections []*connection.Connection
	var total int64

	if err := r.db.WithContext(ctx).Model(&connection.Connection{}).
		Where("workspace_id = ?", workspaceID).
		Count(&total).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	if err := r.db.WithContext(ctx).
		Where("workspace_id = ?", workspaceID).
		Offset(pagination.Offset).
		Limit(pagination.Limit).
		Order("created_at DESC").
		Find(&connections).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	return connections, total, nil
}

func (r *connectionRepository) GetByWorkspaceAndType(ctx context.Context, workspaceID uuid.UUID, connType connection.Type, pagination Pagination) ([]*connection.Connection, int64, error) {
	var connections []*connection.Connection
	var total int64

	if err := r.db.WithContext(ctx).Model(&connection.Connection{}).
		Where("workspace_id = ? AND type = ?", workspaceID, connType).
		Count(&total).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	if err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND type = ?", workspaceID, connType).
		Offset(pagination.Offset).
		Limit(pagination.Limit).
		Order("created_at DESC").
		Find(&connections).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	return connections, total, nil
}

func (r *connectionRepository) Update(ctx context.Context, c *connection.Connection) error {
	if err := r.db.WithContext(ctx).Save(c).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *connectionRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status connection.Status, lastError string) error {
	updates := map[string]interface{}{
		"status":        status,
		"last_tested_at": gorm.Expr("NOW()"),
	}
	if lastError != "" {
		updates["last_error"] = lastError
	}

	if err := r.db.WithContext(ctx).
		Model(&connection.Connection{}).
		Where("id = ?", id).
		Updates(updates).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *connectionRepository) Delete(ctx context.Context, id uuid.UUID) error {
	if err := r.db.WithContext(ctx).Delete(&connection.Connection{}, "id = ?", id).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *connectionRepository) Search(ctx context.Context, workspaceID uuid.UUID, search string, connType string, pagination Pagination) ([]*connection.Connection, int64, error) {
	var connections []*connection.Connection
	var total int64

	query := r.db.WithContext(ctx).Model(&connection.Connection{}).
		Where("workspace_id = ?", workspaceID)

	if search != "" {
		query = query.Where("name ILIKE ? OR description ILIKE ?", 
			fmt.Sprintf("%%%s%%", search),
			fmt.Sprintf("%%%s%%", search))
	}

	if connType != "" {
		query = query.Where("type = ?", connType)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	if err := query.
		Offset(pagination.Offset).
		Limit(pagination.Limit).
		Order("created_at DESC").
		Find(&connections).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	return connections, total, nil
}

func (r *connectionRepository) CountByWorkspace(ctx context.Context, workspaceID uuid.UUID) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&connection.Connection{}).
		Where("workspace_id = ?", workspaceID).
		Count(&count).Error; err != nil {
		return 0, apperrors.NewDatabaseError(err)
	}
	return count, nil
}
