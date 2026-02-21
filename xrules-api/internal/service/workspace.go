package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"xrules-api/internal/domain/user"
	"xrules-api/internal/domain/workspace"
	"xrules-api/internal/infra/cache"
	"xrules-api/internal/repository"
	apperrors "xrules-api/pkg/errors"

	"github.com/google/uuid"
)

// WorkspaceService defines the workspace service interface
type WorkspaceService interface {
	Create(ctx context.Context, ownerID uuid.UUID, req *workspace.CreateWorkspaceRequest) (*workspace.Workspace, error)
	GetByID(ctx context.Context, id uuid.UUID) (*workspace.Workspace, error)
	GetBySlug(ctx context.Context, slug string) (*workspace.Workspace, error)
	ListByUser(ctx context.Context, userID uuid.UUID, page, limit int) (*workspace.ListResponse, error)
	Update(ctx context.Context, id uuid.UUID, userID uuid.UUID, req *workspace.UpdateWorkspaceRequest) (*workspace.Workspace, error)
	Delete(ctx context.Context, id uuid.UUID, userID uuid.UUID) error
	
	// Member management
	AddMember(ctx context.Context, workspaceID uuid.UUID, ownerID uuid.UUID, req *workspace.AddMemberRequest) (*user.WorkspaceMember, error)
	UpdateMember(ctx context.Context, workspaceID uuid.UUID, ownerID uuid.UUID, memberID uuid.UUID, req *workspace.UpdateMemberRequest) (*user.WorkspaceMember, error)
	RemoveMember(ctx context.Context, workspaceID uuid.UUID, ownerID uuid.UUID, memberID uuid.UUID) error
	GetMembers(ctx context.Context, workspaceID uuid.UUID) ([]workspace.MemberResponse, error)
	
	// Permissions
	HasPermission(ctx context.Context, workspaceID, userID uuid.UUID, minRole string) (bool, error)
	IsOwner(ctx context.Context, workspaceID, userID uuid.UUID) (bool, error)
	GetMemberRole(ctx context.Context, workspaceID, userID uuid.UUID) (string, error)
}

// workspaceService implements WorkspaceService
type workspaceService struct {
	workspaceRepo repository.WorkspaceRepository
	cache         *cache.Cache
}

// NewWorkspaceService creates a new workspace service
func NewWorkspaceService(workspaceRepo repository.WorkspaceRepository, cache *cache.Cache) WorkspaceService {
	return &workspaceService{
		workspaceRepo: workspaceRepo,
		cache:         cache,
	}
}

func (s *workspaceService) Create(ctx context.Context, ownerID uuid.UUID, req *workspace.CreateWorkspaceRequest) (*workspace.Workspace, error) {
	// Validate and sanitize slug
	slug := strings.ToLower(strings.TrimSpace(req.Slug))
	if slug == "" {
		slug = generateSlug(req.Name)
	}

	w := &workspace.Workspace{
		Name:        req.Name,
		Slug:        slug,
		Description: req.Description,
		OwnerID:     ownerID,
		Plan:        workspace.PlanFree,
		Settings:    workspace.DefaultPlanSettings[workspace.PlanFree],
	}

	if err := s.workspaceRepo.Create(ctx, w); err != nil {
		return nil, err
	}

	// Cache the workspace
	s.cacheWorkspace(ctx, w)

	return w, nil
}

func (s *workspaceService) GetByID(ctx context.Context, id uuid.UUID) (*workspace.Workspace, error) {
	// Try cache first
	var w workspace.Workspace
	cacheKey := fmt.Sprintf("workspace:%s", id.String())
	if err := s.cache.GetJSON(ctx, cacheKey, &w); err == nil {
		return &w, nil
	}

	// Get from database
	wDB, err := s.workspaceRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Cache it
	s.cacheWorkspace(ctx, wDB)

	return wDB, nil
}

func (s *workspaceService) GetBySlug(ctx context.Context, slug string) (*workspace.Workspace, error) {
	return s.workspaceRepo.GetBySlug(ctx, slug)
}

func (s *workspaceService) ListByUser(ctx context.Context, userID uuid.UUID, page, limit int) (*workspace.ListResponse, error) {
	pagination := repository.NewPagination(page, limit)
	
	workspaces, total, err := s.workspaceRepo.GetByMember(ctx, userID, pagination)
	if err != nil {
		return nil, err
	}

	// Get member counts
	responses := make([]*workspace.WorkspaceResponse, len(workspaces))
	for i, w := range workspaces {
		resp := w.ToResponse()
		count, _ := s.workspaceRepo.CountMembers(ctx, w.ID)
		resp.MemberCount = int(count)
		responses[i] = resp
	}

	totalPages := int(total) / limit
	if int(total)%limit > 0 {
		totalPages++
	}

	return &workspace.ListResponse{
		Data:       responses,
		Total:      total,
		Page:       page,
		Limit:      limit,
		TotalPages: totalPages,
	}, nil
}

func (s *workspaceService) Update(ctx context.Context, id uuid.UUID, userID uuid.UUID, req *workspace.UpdateWorkspaceRequest) (*workspace.Workspace, error) {
	// Check permissions
	if ok, err := s.workspaceRepo.HasPermission(ctx, id, userID, "admin"); err != nil || !ok {
		if err != nil {
			return nil, err
		}
		return nil, apperrors.NewForbiddenError("you don't have permission to update this workspace")
	}

	w, err := s.workspaceRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if req.Name != "" {
		w.Name = req.Name
	}
	if req.Description != "" {
		w.Description = req.Description
	}
	if req.Settings != nil {
		w.Settings = *req.Settings
	}

	if err := s.workspaceRepo.Update(ctx, w); err != nil {
		return nil, err
	}

	// Invalidate cache
	s.invalidateCache(ctx, id)

	return w, nil
}

func (s *workspaceService) Delete(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	// Check if owner
	if ok, err := s.workspaceRepo.IsOwner(ctx, id, userID); err != nil || !ok {
		if err != nil {
			return err
		}
		return apperrors.NewForbiddenError("only workspace owner can delete the workspace")
	}

	if err := s.workspaceRepo.Delete(ctx, id); err != nil {
		return err
	}

	// Invalidate cache
	s.invalidateCache(ctx, id)

	return nil
}

func (s *workspaceService) AddMember(ctx context.Context, workspaceID uuid.UUID, ownerID uuid.UUID, req *workspace.AddMemberRequest) (*user.WorkspaceMember, error) {
	// Check permissions
	if ok, err := s.workspaceRepo.HasPermission(ctx, workspaceID, ownerID, "admin"); err != nil || !ok {
		if err != nil {
			return nil, err
		}
		return nil, apperrors.NewForbiddenError("you don't have permission to add members")
	}

	userID, err := uuid.Parse(req.UserID)
	if err != nil {
		return nil, apperrors.NewValidationError("invalid user ID")
	}

	member := &user.WorkspaceMember{
		WorkspaceID: workspaceID,
		UserID:      userID,
		Role:        req.Role,
	}

	if err := s.workspaceRepo.AddMember(ctx, member); err != nil {
		return nil, err
	}

	return member, nil
}

func (s *workspaceService) UpdateMember(ctx context.Context, workspaceID uuid.UUID, ownerID uuid.UUID, memberID uuid.UUID, req *workspace.UpdateMemberRequest) (*user.WorkspaceMember, error) {
	// Check permissions
	if ok, err := s.workspaceRepo.HasPermission(ctx, workspaceID, ownerID, "admin"); err != nil || !ok {
		if err != nil {
			return nil, err
		}
		return nil, apperrors.NewForbiddenError("you don't have permission to update members")
	}

	member, err := s.workspaceRepo.GetMember(ctx, workspaceID, memberID)
	if err != nil {
		return nil, err
	}

	member.Role = req.Role
	if err := s.workspaceRepo.UpdateMember(ctx, member); err != nil {
		return nil, err
	}

	return member, nil
}

func (s *workspaceService) RemoveMember(ctx context.Context, workspaceID uuid.UUID, ownerID uuid.UUID, memberID uuid.UUID) error {
	// Check permissions
	if ok, err := s.workspaceRepo.HasPermission(ctx, workspaceID, ownerID, "admin"); err != nil || !ok {
		if err != nil {
			return err
		}
		return apperrors.NewForbiddenError("you don't have permission to remove members")
	}

	// Cannot remove owner
	if ok, _ := s.workspaceRepo.IsOwner(ctx, workspaceID, memberID); ok {
		return apperrors.NewForbiddenError("cannot remove workspace owner")
	}

	return s.workspaceRepo.RemoveMember(ctx, workspaceID, memberID)
}

func (s *workspaceService) GetMembers(ctx context.Context, workspaceID uuid.UUID) ([]workspace.MemberResponse, error) {
	members, err := s.workspaceRepo.GetMembers(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	responses := make([]workspace.MemberResponse, len(members))
	for i, m := range members {
		responses[i] = workspace.MemberResponse{
			ID:       m.ID,
			UserID:   m.UserID,
			Role:     m.Role,
			JoinedAt: m.JoinedAt,
		}
	}

	return responses, nil
}

func (s *workspaceService) HasPermission(ctx context.Context, workspaceID, userID uuid.UUID, minRole string) (bool, error) {
	return s.workspaceRepo.HasPermission(ctx, workspaceID, userID, minRole)
}

func (s *workspaceService) IsOwner(ctx context.Context, workspaceID, userID uuid.UUID) (bool, error) {
	return s.workspaceRepo.IsOwner(ctx, workspaceID, userID)
}

func (s *workspaceService) GetMemberRole(ctx context.Context, workspaceID, userID uuid.UUID) (string, error) {
	member, err := s.workspaceRepo.GetMember(ctx, workspaceID, userID)
	if err != nil {
		return "", err
	}
	return member.Role, nil
}

func (s *workspaceService) cacheWorkspace(ctx context.Context, w *workspace.Workspace) {
	cacheKey := fmt.Sprintf("workspace:%s", w.ID.String())
	s.cache.SetJSON(ctx, cacheKey, w, 5*time.Minute)
}

func (s *workspaceService) invalidateCache(ctx context.Context, id uuid.UUID) {
	cacheKey := fmt.Sprintf("workspace:%s", id.String())
	s.cache.Delete(ctx, cacheKey)
}

func generateSlug(name string) string {
	// Simple slug generation
	slug := strings.ToLower(name)
	slug = strings.ReplaceAll(slug, " ", "-")
	slug = strings.ReplaceAll(slug, "_", "-")
	// Remove non-alphanumeric characters except hyphens
	var result strings.Builder
	for _, r := range slug {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			result.WriteRune(r)
		}
	}
	return result.String()
}
