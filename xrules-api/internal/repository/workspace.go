package repository

import (
	"context"

	apperrors "xrules-api/pkg/errors"
	"xrules-api/internal/domain/user"
	"xrules-api/internal/domain/workspace"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// WorkspaceRepository defines the workspace repository interface
type WorkspaceRepository interface {
	Create(ctx context.Context, w *workspace.Workspace) error
	GetByID(ctx context.Context, id uuid.UUID) (*workspace.Workspace, error)
	GetBySlug(ctx context.Context, slug string) (*workspace.Workspace, error)
	GetByOwner(ctx context.Context, ownerID uuid.UUID, pagination Pagination) ([]*workspace.Workspace, int64, error)
	GetByMember(ctx context.Context, userID uuid.UUID, pagination Pagination) ([]*workspace.Workspace, int64, error)
	Update(ctx context.Context, w *workspace.Workspace) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, pagination Pagination) ([]*workspace.Workspace, int64, error)
	
	// Member management
	AddMember(ctx context.Context, member *user.WorkspaceMember) error
	UpdateMember(ctx context.Context, member *user.WorkspaceMember) error
	RemoveMember(ctx context.Context, workspaceID, userID uuid.UUID) error
	GetMember(ctx context.Context, workspaceID, userID uuid.UUID) (*user.WorkspaceMember, error)
	GetMembers(ctx context.Context, workspaceID uuid.UUID) ([]user.WorkspaceMember, error)
	CountMembers(ctx context.Context, workspaceID uuid.UUID) (int64, error)
	
	// Check ownership/membership
	IsOwner(ctx context.Context, workspaceID, userID uuid.UUID) (bool, error)
	IsMember(ctx context.Context, workspaceID, userID uuid.UUID) (bool, error)
	HasPermission(ctx context.Context, workspaceID, userID uuid.UUID, minRole string) (bool, error)
}

// workspaceRepository implements WorkspaceRepository
type workspaceRepository struct {
	db *gorm.DB
}

// NewWorkspaceRepository creates a new workspace repository
func NewWorkspaceRepository(db *gorm.DB) WorkspaceRepository {
	return &workspaceRepository{db: db}
}

func (r *workspaceRepository) Create(ctx context.Context, w *workspace.Workspace) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Create workspace
		if err := tx.Create(w).Error; err != nil {
			if isDuplicateError(err) {
				return apperrors.NewConflictError("workspace with this slug already exists")
			}
			return apperrors.NewDatabaseError(err)
		}

		// Add owner as member
		member := &user.WorkspaceMember{
			WorkspaceID: w.ID,
			UserID:      w.OwnerID,
			Role:        "owner",
		}
		if err := tx.Create(member).Error; err != nil {
			return apperrors.NewDatabaseError(err)
		}

		return nil
	})
}

func (r *workspaceRepository) GetByID(ctx context.Context, id uuid.UUID) (*workspace.Workspace, error) {
	var w workspace.Workspace
	if err := r.db.WithContext(ctx).First(&w, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperrors.NewNotFoundError("workspace")
		}
		return nil, apperrors.NewDatabaseError(err)
	}
	return &w, nil
}

func (r *workspaceRepository) GetBySlug(ctx context.Context, slug string) (*workspace.Workspace, error) {
	var w workspace.Workspace
	if err := r.db.WithContext(ctx).First(&w, "slug = ?", slug).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperrors.NewNotFoundError("workspace")
		}
		return nil, apperrors.NewDatabaseError(err)
	}
	return &w, nil
}

func (r *workspaceRepository) GetByOwner(ctx context.Context, ownerID uuid.UUID, pagination Pagination) ([]*workspace.Workspace, int64, error) {
	var workspaces []*workspace.Workspace
	var total int64

	if err := r.db.WithContext(ctx).Model(&workspace.Workspace{}).
		Where("owner_id = ?", ownerID).
		Count(&total).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	if err := r.db.WithContext(ctx).
		Where("owner_id = ?", ownerID).
		Offset(pagination.Offset).
		Limit(pagination.Limit).
		Order("created_at DESC").
		Find(&workspaces).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	return workspaces, total, nil
}

func (r *workspaceRepository) GetByMember(ctx context.Context, userID uuid.UUID, pagination Pagination) ([]*workspace.Workspace, int64, error) {
	var workspaces []*workspace.Workspace
	var total int64

	subQuery := r.db.Model(&user.WorkspaceMember{}).
		Select("workspace_id").
		Where("user_id = ?", userID)

	if err := r.db.WithContext(ctx).Model(&workspace.Workspace{}).
		Where("id IN (?)", subQuery).
		Count(&total).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	if err := r.db.WithContext(ctx).
		Where("id IN (?)", subQuery).
		Offset(pagination.Offset).
		Limit(pagination.Limit).
		Order("created_at DESC").
		Find(&workspaces).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	return workspaces, total, nil
}

func (r *workspaceRepository) Update(ctx context.Context, w *workspace.Workspace) error {
	if err := r.db.WithContext(ctx).Save(w).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *workspaceRepository) Delete(ctx context.Context, id uuid.UUID) error {
	if err := r.db.WithContext(ctx).Delete(&workspace.Workspace{}, "id = ?", id).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *workspaceRepository) List(ctx context.Context, pagination Pagination) ([]*workspace.Workspace, int64, error) {
	var workspaces []*workspace.Workspace
	var total int64

	if err := r.db.WithContext(ctx).Model(&workspace.Workspace{}).Count(&total).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	if err := r.db.WithContext(ctx).
		Offset(pagination.Offset).
		Limit(pagination.Limit).
		Order("created_at DESC").
		Find(&workspaces).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	return workspaces, total, nil
}

func (r *workspaceRepository) AddMember(ctx context.Context, member *user.WorkspaceMember) error {
	if err := r.db.WithContext(ctx).Create(member).Error; err != nil {
		if isDuplicateError(err) {
			return apperrors.NewConflictError("user is already a member of this workspace")
		}
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *workspaceRepository) UpdateMember(ctx context.Context, member *user.WorkspaceMember) error {
	if err := r.db.WithContext(ctx).Save(member).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *workspaceRepository) RemoveMember(ctx context.Context, workspaceID, userID uuid.UUID) error {
	if err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND user_id = ?", workspaceID, userID).
		Delete(&user.WorkspaceMember{}).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *workspaceRepository) GetMember(ctx context.Context, workspaceID, userID uuid.UUID) (*user.WorkspaceMember, error) {
	var member user.WorkspaceMember
	if err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND user_id = ?", workspaceID, userID).
		First(&member).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperrors.NewNotFoundError("workspace member")
		}
		return nil, apperrors.NewDatabaseError(err)
	}
	return &member, nil
}

func (r *workspaceRepository) GetMembers(ctx context.Context, workspaceID uuid.UUID) ([]user.WorkspaceMember, error) {
	var members []user.WorkspaceMember
	if err := r.db.WithContext(ctx).
		Where("workspace_id = ?", workspaceID).
		Find(&members).Error; err != nil {
		return nil, apperrors.NewDatabaseError(err)
	}
	return members, nil
}

func (r *workspaceRepository) CountMembers(ctx context.Context, workspaceID uuid.UUID) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&user.WorkspaceMember{}).
		Where("workspace_id = ?", workspaceID).
		Count(&count).Error; err != nil {
		return 0, apperrors.NewDatabaseError(err)
	}
	return count, nil
}

func (r *workspaceRepository) IsOwner(ctx context.Context, workspaceID, userID uuid.UUID) (bool, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&workspace.Workspace{}).
		Where("id = ? AND owner_id = ?", workspaceID, userID).
		Count(&count).Error; err != nil {
		return false, apperrors.NewDatabaseError(err)
	}
	return count > 0, nil
}

func (r *workspaceRepository) IsMember(ctx context.Context, workspaceID, userID uuid.UUID) (bool, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&user.WorkspaceMember{}).
		Where("workspace_id = ? AND user_id = ?", workspaceID, userID).
		Count(&count).Error; err != nil {
		return false, apperrors.NewDatabaseError(err)
	}
	return count > 0, nil
}

func (r *workspaceRepository) HasPermission(ctx context.Context, workspaceID, userID uuid.UUID, minRole string) (bool, error) {
	member, err := r.GetMember(ctx, workspaceID, userID)
	if err != nil {
		return false, err
	}
	return member.HasPermission(minRole), nil
}
