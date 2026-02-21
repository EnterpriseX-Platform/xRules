package repository

import (
	"context"
	"fmt"

	apperrors "xrules-api/pkg/errors"
	"xrules-api/internal/domain/rules"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// RulesRepository defines the rules repository interface
type RulesRepository interface {
	Create(ctx context.Context, rp *rules.RulesProject) error
	GetByID(ctx context.Context, id uuid.UUID) (*rules.RulesProject, error)
	GetByProject(ctx context.Context, projectID uuid.UUID, pagination Pagination) ([]*rules.RulesProject, int64, error)
	GetByProjectAndStatus(ctx context.Context, projectID uuid.UUID, status rules.Status, pagination Pagination) ([]*rules.RulesProject, int64, error)
	Update(ctx context.Context, rp *rules.RulesProject) error
	UpdateStatus(ctx context.Context, id uuid.UUID, status rules.Status) error
	Delete(ctx context.Context, id uuid.UUID) error
	Search(ctx context.Context, projectID uuid.UUID, search string, pagination Pagination) ([]*rules.RulesProject, int64, error)
	CountByProject(ctx context.Context, projectID uuid.UUID) (int64, error)
	IncrementVersion(ctx context.Context, id uuid.UUID) error
}

// rulesRepository implements RulesRepository
type rulesRepository struct {
	db *gorm.DB
}

// NewRulesRepository creates a new rules repository
func NewRulesRepository(db *gorm.DB) RulesRepository {
	return &rulesRepository{db: db}
}

func (r *rulesRepository) Create(ctx context.Context, rp *rules.RulesProject) error {
	if err := r.db.WithContext(ctx).Create(rp).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *rulesRepository) GetByID(ctx context.Context, id uuid.UUID) (*rules.RulesProject, error) {
	var rp rules.RulesProject
	if err := r.db.WithContext(ctx).First(&rp, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperrors.NewNotFoundError("rules project")
		}
		return nil, apperrors.NewDatabaseError(err)
	}
	return &rp, nil
}

func (r *rulesRepository) GetByProject(ctx context.Context, projectID uuid.UUID, pagination Pagination) ([]*rules.RulesProject, int64, error) {
	var rulesProjects []*rules.RulesProject
	var total int64

	if err := r.db.WithContext(ctx).Model(&rules.RulesProject{}).
		Where("project_id = ?", projectID).
		Count(&total).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	if err := r.db.WithContext(ctx).
		Where("project_id = ?", projectID).
		Offset(pagination.Offset).
		Limit(pagination.Limit).
		Order("created_at DESC").
		Find(&rulesProjects).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	return rulesProjects, total, nil
}

func (r *rulesRepository) GetByProjectAndStatus(ctx context.Context, projectID uuid.UUID, status rules.Status, pagination Pagination) ([]*rules.RulesProject, int64, error) {
	var rulesProjects []*rules.RulesProject
	var total int64

	if err := r.db.WithContext(ctx).Model(&rules.RulesProject{}).
		Where("project_id = ? AND status = ?", projectID, status).
		Count(&total).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	if err := r.db.WithContext(ctx).
		Where("project_id = ? AND status = ?", projectID, status).
		Offset(pagination.Offset).
		Limit(pagination.Limit).
		Order("created_at DESC").
		Find(&rulesProjects).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	return rulesProjects, total, nil
}

func (r *rulesRepository) Update(ctx context.Context, rp *rules.RulesProject) error {
	// GORM will auto-increment version via BeforeUpdate hook
	if err := r.db.WithContext(ctx).Save(rp).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *rulesRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status rules.Status) error {
	if err := r.db.WithContext(ctx).
		Model(&rules.RulesProject{}).
		Where("id = ?", id).
		Update("status", status).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *rulesRepository) Delete(ctx context.Context, id uuid.UUID) error {
	if err := r.db.WithContext(ctx).Delete(&rules.RulesProject{}, "id = ?", id).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *rulesRepository) Search(ctx context.Context, projectID uuid.UUID, search string, pagination Pagination) ([]*rules.RulesProject, int64, error) {
	var rulesProjects []*rules.RulesProject
	var total int64

	query := r.db.WithContext(ctx).Model(&rules.RulesProject{}).
		Where("project_id = ?", projectID)

	if search != "" {
		query = query.Where("name ILIKE ? OR description ILIKE ?", 
			fmt.Sprintf("%%%s%%", search),
			fmt.Sprintf("%%%s%%", search))
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	if err := query.
		Offset(pagination.Offset).
		Limit(pagination.Limit).
		Order("created_at DESC").
		Find(&rulesProjects).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	return rulesProjects, total, nil
}

func (r *rulesRepository) CountByProject(ctx context.Context, projectID uuid.UUID) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&rules.RulesProject{}).
		Where("project_id = ?", projectID).
		Count(&count).Error; err != nil {
		return 0, apperrors.NewDatabaseError(err)
	}
	return count, nil
}

func (r *rulesRepository) IncrementVersion(ctx context.Context, id uuid.UUID) error {
	if err := r.db.WithContext(ctx).
		Model(&rules.RulesProject{}).
		Where("id = ?", id).
		UpdateColumn("version", gorm.Expr("version + 1")).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}
