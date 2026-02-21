package service

import (
	"context"

	"xrules-api/internal/domain/user"
	"xrules-api/internal/repository"
	apperrors "xrules-api/pkg/errors"

	"github.com/google/uuid"
)

// UserService defines the user service interface
type UserService interface {
	GetByID(ctx context.Context, id uuid.UUID) (*user.User, error)
	GetByEmail(ctx context.Context, email string) (*user.User, error)
	Update(ctx context.Context, id uuid.UUID, req *user.UpdateUserRequest) (*user.User, error)
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, page, limit int) ([]*user.User, int64, error)
	
	// Workspace membership
	GetWorkspaceMemberships(ctx context.Context, userID uuid.UUID) ([]user.WorkspaceMember, error)
}

// userService implements UserService
type userService struct {
	userRepo repository.UserRepository
}

// NewUserService creates a new user service
func NewUserService(userRepo repository.UserRepository) UserService {
	return &userService{userRepo: userRepo}
}

func (s *userService) GetByID(ctx context.Context, id uuid.UUID) (*user.User, error) {
	return s.userRepo.GetByID(ctx, id)
}

func (s *userService) GetByEmail(ctx context.Context, email string) (*user.User, error) {
	return s.userRepo.GetByEmail(ctx, email)
}

func (s *userService) Update(ctx context.Context, id uuid.UUID, req *user.UpdateUserRequest) (*user.User, error) {
	u, err := s.userRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if req.Name != "" {
		u.Name = req.Name
	}
	if req.Avatar != "" {
		u.Avatar = req.Avatar
	}

	if err := s.userRepo.Update(ctx, u); err != nil {
		return nil, err
	}

	return u, nil
}

func (s *userService) Delete(ctx context.Context, id uuid.UUID) error {
	// Check if user exists
	_, err := s.userRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	return s.userRepo.Delete(ctx, id)
}

func (s *userService) List(ctx context.Context, page, limit int) ([]*user.User, int64, error) {
	pagination := repository.NewPagination(page, limit)
	return s.userRepo.List(ctx, pagination)
}

func (s *userService) GetWorkspaceMemberships(ctx context.Context, userID uuid.UUID) ([]user.WorkspaceMember, error) {
	// This would need to be implemented in the repository
	// For now, return an error
	return nil, apperrors.NewInternalError(nil)
}
