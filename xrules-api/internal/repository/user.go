package repository

import (
	"context"

	apperrors "xrules-api/pkg/errors"
	"xrules-api/internal/domain/user"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// UserRepository defines the user repository interface
type UserRepository interface {
	Create(ctx context.Context, u *user.User) error
	GetByID(ctx context.Context, id uuid.UUID) (*user.User, error)
	GetByEmail(ctx context.Context, email string) (*user.User, error)
	Update(ctx context.Context, u *user.User) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, pagination Pagination) ([]*user.User, int64, error)
	UpdateLastLogin(ctx context.Context, id uuid.UUID) error

	// Workspace membership
	GetWorkspaceMember(ctx context.Context, workspaceID, userID uuid.UUID) (*user.WorkspaceMember, error)
	GetWorkspaceMembers(ctx context.Context, workspaceID uuid.UUID) ([]user.WorkspaceMember, error)
	AddWorkspaceMember(ctx context.Context, member *user.WorkspaceMember) error
	UpdateWorkspaceMember(ctx context.Context, member *user.WorkspaceMember) error
	RemoveWorkspaceMember(ctx context.Context, workspaceID, userID uuid.UUID) error

	// OAuth accounts
	GetOAuthAccount(ctx context.Context, provider user.OAuthProvider, providerID string) (*user.OAuthAccount, error)
	CreateOAuthAccount(ctx context.Context, account *user.OAuthAccount) error
	GetUserOAuthAccounts(ctx context.Context, userID uuid.UUID) ([]user.OAuthAccount, error)
	DeleteOAuthAccount(ctx context.Context, accountID uuid.UUID) error
	GetUserByOAuthAccount(ctx context.Context, provider user.OAuthProvider, providerID string) (*user.User, error)
}

// userRepository implements UserRepository
type userRepository struct {
	db *gorm.DB
}

// NewUserRepository creates a new user repository
func NewUserRepository(db *gorm.DB) UserRepository {
	return &userRepository{db: db}
}

func (r *userRepository) Create(ctx context.Context, u *user.User) error {
	if err := r.db.WithContext(ctx).Create(u).Error; err != nil {
		if isDuplicateError(err) {
			return apperrors.NewConflictError("user with this email already exists")
		}
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *userRepository) GetByID(ctx context.Context, id uuid.UUID) (*user.User, error) {
	var u user.User
	if err := r.db.WithContext(ctx).First(&u, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperrors.NewNotFoundError("user")
		}
		return nil, apperrors.NewDatabaseError(err)
	}
	return &u, nil
}

func (r *userRepository) GetByEmail(ctx context.Context, email string) (*user.User, error) {
	var u user.User
	if err := r.db.WithContext(ctx).First(&u, "email = ?", email).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperrors.NewNotFoundError("user")
		}
		return nil, apperrors.NewDatabaseError(err)
	}
	return &u, nil
}

func (r *userRepository) Update(ctx context.Context, u *user.User) error {
	if err := r.db.WithContext(ctx).Save(u).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *userRepository) Delete(ctx context.Context, id uuid.UUID) error {
	if err := r.db.WithContext(ctx).Delete(&user.User{}, "id = ?", id).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *userRepository) List(ctx context.Context, pagination Pagination) ([]*user.User, int64, error) {
	var users []*user.User
	var total int64

	if err := r.db.WithContext(ctx).Model(&user.User{}).Count(&total).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	if err := r.db.WithContext(ctx).
		Offset(pagination.Offset).
		Limit(pagination.Limit).
		Order("created_at DESC").
		Find(&users).Error; err != nil {
		return nil, 0, apperrors.NewDatabaseError(err)
	}

	return users, total, nil
}

func (r *userRepository) UpdateLastLogin(ctx context.Context, id uuid.UUID) error {
	if err := r.db.WithContext(ctx).
		Model(&user.User{}).
		Where("id = ?", id).
		Update("last_login", gorm.Expr("NOW()")).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *userRepository) GetWorkspaceMember(ctx context.Context, workspaceID, userID uuid.UUID) (*user.WorkspaceMember, error) {
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

func (r *userRepository) GetWorkspaceMembers(ctx context.Context, workspaceID uuid.UUID) ([]user.WorkspaceMember, error) {
	var members []user.WorkspaceMember
	if err := r.db.WithContext(ctx).
		Where("workspace_id = ?", workspaceID).
		Find(&members).Error; err != nil {
		return nil, apperrors.NewDatabaseError(err)
	}
	return members, nil
}

func (r *userRepository) AddWorkspaceMember(ctx context.Context, member *user.WorkspaceMember) error {
	if err := r.db.WithContext(ctx).Create(member).Error; err != nil {
		if isDuplicateError(err) {
			return apperrors.NewConflictError("user is already a member of this workspace")
		}
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *userRepository) UpdateWorkspaceMember(ctx context.Context, member *user.WorkspaceMember) error {
	if err := r.db.WithContext(ctx).Save(member).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *userRepository) RemoveWorkspaceMember(ctx context.Context, workspaceID, userID uuid.UUID) error {
	if err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND user_id = ?", workspaceID, userID).
		Delete(&user.WorkspaceMember{}).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *userRepository) GetOAuthAccount(ctx context.Context, provider user.OAuthProvider, providerID string) (*user.OAuthAccount, error) {
	var account user.OAuthAccount
	if err := r.db.WithContext(ctx).
		Where("provider = ? AND provider_id = ?", provider, providerID).
		First(&account).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperrors.NewNotFoundError("oauth account")
		}
		return nil, apperrors.NewDatabaseError(err)
	}
	return &account, nil
}

func (r *userRepository) CreateOAuthAccount(ctx context.Context, account *user.OAuthAccount) error {
	if err := r.db.WithContext(ctx).Create(account).Error; err != nil {
		if isDuplicateError(err) {
			return apperrors.NewConflictError("oauth account already exists")
		}
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *userRepository) GetUserOAuthAccounts(ctx context.Context, userID uuid.UUID) ([]user.OAuthAccount, error) {
	var accounts []user.OAuthAccount
	if err := r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Find(&accounts).Error; err != nil {
		return nil, apperrors.NewDatabaseError(err)
	}
	return accounts, nil
}

func (r *userRepository) DeleteOAuthAccount(ctx context.Context, accountID uuid.UUID) error {
	if err := r.db.WithContext(ctx).
		Delete(&user.OAuthAccount{}, "id = ?", accountID).Error; err != nil {
		return apperrors.NewDatabaseError(err)
	}
	return nil
}

func (r *userRepository) GetUserByOAuthAccount(ctx context.Context, provider user.OAuthProvider, providerID string) (*user.User, error) {
	var u user.User
	if err := r.db.WithContext(ctx).
		Joins("JOIN oauth_accounts ON oauth_accounts.user_id = users.id").
		Where("oauth_accounts.provider = ? AND oauth_accounts.provider_id = ?", provider, providerID).
		First(&u).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperrors.NewNotFoundError("user")
		}
		return nil, apperrors.NewDatabaseError(err)
	}
	return &u, nil
}

func isDuplicateError(err error) bool {
	// Check for PostgreSQL duplicate key error
	if err == nil {
		return false
	}
	errStr := err.Error()
	return contains(errStr, "duplicate key") || contains(errStr, "unique constraint")
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsHelper(s, substr))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
