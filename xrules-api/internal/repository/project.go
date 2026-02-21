package repository

import (
	"context"
	"fmt"

	apperrors "xrules-api/pkg/errors"
	"xrules-api/internal/domain/project"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ProjectRepository defines the project repository interface
type ProjectRepository interface {
	Create(ctx context.Context, p *project.Project) error
	GetByID(ctx context.Context, id uuid.UUID) (*project.Project, error)
	GetByWorkspace(ctx context.Context, workspaceID uuid.UUID, pagination Pagination) ([]*project.Project, int64, error)
	Update(ctx context.Context, p *project.Project) error
	Delete(ctx context.Context, id uuid.UUID) error
	Search(ctx context.Context, workspaceID uuid.UUID, search string, pagination Pagination) ([]*project.Project, int64, error)
	CountByWorkspace(ctx context.Context, workspaceID uuid.UUID) (int64, error)
}

// projectRepository implements ProjectRepository
type projectRepository struct {
	db *gorm.DB
}

// NewProjectRepository creates a new project repository
func NewProjectRepository(db *gorm.DB) ProjectRepository {
	return &projectRepository{db: db}
}

func (r *projectRepository) Create(ctx context.Context, p *project.Project) error {
	if err := r.db.WithContext(ctx).Create(p).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *projectRepository) GetByID(ctx context.Context, id uuid.UUID) (*project.Project, error) {
	var p project.Project
	if err := r.db.WithContext(ctx).First(&p, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperrors.NewNotFoundError("project")
		}
		return nil, apperrors.NewDatabaseError(err)
	}
	return &p, nil
}

func (r *projectRepository) GetByWorkspace(ctx context.Context, workspaceID uuid.UUID, pagination Pagination) ([]*project.Project, int64, error) {
	var projects []*project.Project
	var total int64

	if err := r.db.WithContext(ctx).Model(&project.Project{}).
		Where("workspace_id = ?", workspaceID).
		Count(&total).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	if err := r.db.WithContext(ctx).
		Where("workspace_id = ?", workspaceID).
		Offset(pagination.Offset).
		Limit(pagination.Limit).
		Order("created_at DESC").
		Find(&projects).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	return projects, total, nil
}

func (r *projectRepository) Update(ctx context.Context, p *project.Project) error {
	if err := r.db.WithContext(ctx).Save(p).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *projectRepository) Delete(ctx context.Context, id uuid.UUID) error {
	if err := r.db.WithContext(ctx).Delete(&project.Project{}, "id = ?", id).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *projectRepository) Search(ctx context.Context, workspaceID uuid.UUID, search string, pagination Pagination) ([]*project.Project, int64, error) {
	var projects []*project.Project
	var total int64

	query := r.db.WithContext(ctx).Model(&project.Project{}).
		Where("workspace_id = ?", workspaceID)

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
		Find(&projects).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	return projects, total, nil
}

func (r *projectRepository) CountByWorkspace(ctx context.Context, workspaceID uuid.UUID) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&project.Project{}).
		Where("workspace_id = ?", workspaceID).
		Count(&count).Error; err != nil {
		return 0, apperrors.NewDatabaseError(err)
	}
	return count, nil
}
