package service

import (
	"context"

	"xrules-api/internal/domain/project"
	"xrules-api/internal/repository"
	apperrors "xrules-api/pkg/errors"

	"github.com/google/uuid"
)

// ProjectService defines the project service interface
type ProjectService interface {
	Create(ctx context.Context, workspaceID, userID uuid.UUID, req *project.CreateProjectRequest) (*project.Project, error)
	GetByID(ctx context.Context, id uuid.UUID) (*project.Project, error)
	ListByWorkspace(ctx context.Context, workspaceID uuid.UUID, page, limit int, search string) (*project.ListProjectsResponse, error)
	Update(ctx context.Context, id uuid.UUID, userID uuid.UUID, req *project.UpdateProjectRequest) (*project.Project, error)
	Delete(ctx context.Context, id uuid.UUID, userID uuid.UUID) error
	CountByWorkspace(ctx context.Context, workspaceID uuid.UUID) (int64, error)
}

// projectService implements ProjectService
type projectService struct {
	projectRepo   repository.ProjectRepository
	workspaceRepo repository.WorkspaceRepository
}

// NewProjectService creates a new project service
func NewProjectService(projectRepo repository.ProjectRepository, workspaceRepo repository.WorkspaceRepository) ProjectService {
	return &projectService{
		projectRepo:   projectRepo,
		workspaceRepo: workspaceRepo,
	}
}

func (s *projectService) Create(ctx context.Context, workspaceID, userID uuid.UUID, req *project.CreateProjectRequest) (*project.Project, error) {
	// Check if user is member of workspace
	if ok, err := s.workspaceRepo.IsMember(ctx, workspaceID, userID); err != nil || !ok {
		if err != nil {
			return nil, err
		}
		return nil, apperrors.NewForbiddenError("you don't have access to this workspace")
	}

	// Check workspace limits
	count, err := s.projectRepo.CountByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	workspace, err := s.workspaceRepo.GetByID(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	if workspace.Settings.MaxProjects > 0 && count >= int64(workspace.Settings.MaxProjects) {
		return nil, apperrors.NewForbiddenError("maximum number of projects reached for this workspace")
	}

	p := &project.Project{
		WorkspaceID: workspaceID,
		Name:        req.Name,
		Description: req.Description,
		Settings:    req.Settings,
	}

	if err := s.projectRepo.Create(ctx, p); err != nil {
		return nil, err
	}

	return p, nil
}

func (s *projectService) GetByID(ctx context.Context, id uuid.UUID) (*project.Project, error) {
	return s.projectRepo.GetByID(ctx, id)
}

func (s *projectService) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID, page, limit int, search string) (*project.ListProjectsResponse, error) {
	pagination := repository.NewPagination(page, limit)

	var projects []*project.Project
	var total int64
	var err error

	if search != "" {
		projects, total, err = s.projectRepo.Search(ctx, workspaceID, search, pagination)
	} else {
		projects, total, err = s.projectRepo.GetByWorkspace(ctx, workspaceID, pagination)
	}

	if err != nil {
		return nil, err
	}

	responses := make([]*project.ProjectResponse, len(projects))
	for i, p := range projects {
		responses[i] = p.ToResponse()
	}

	totalPages := int(total) / limit
	if int(total)%limit > 0 {
		totalPages++
	}

	return &project.ListProjectsResponse{
		Data:       responses,
		Total:      total,
		Page:       page,
		Limit:      limit,
		TotalPages: totalPages,
	}, nil
}

func (s *projectService) Update(ctx context.Context, id uuid.UUID, userID uuid.UUID, req *project.UpdateProjectRequest) (*project.Project, error) {
	p, err := s.projectRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Check permissions
	if ok, err := s.workspaceRepo.HasPermission(ctx, p.WorkspaceID, userID, "member"); err != nil || !ok {
		if err != nil {
			return nil, err
		}
		return nil, apperrors.NewForbiddenError("you don't have permission to update this project")
	}

	if req.Name != "" {
		p.Name = req.Name
	}
	if req.Description != "" {
		p.Description = req.Description
	}
	if req.Settings.Environment != "" {
		p.Settings = req.Settings
	}
	if req.IsActive != nil {
		p.IsActive = *req.IsActive
	}

	if err := s.projectRepo.Update(ctx, p); err != nil {
		return nil, err
	}

	return p, nil
}

func (s *projectService) Delete(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	p, err := s.projectRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	// Check permissions
	if ok, err := s.workspaceRepo.HasPermission(ctx, p.WorkspaceID, userID, "admin"); err != nil || !ok {
		if err != nil {
			return err
		}
		return apperrors.NewForbiddenError("you don't have permission to delete this project")
	}

	return s.projectRepo.Delete(ctx, id)
}

func (s *projectService) CountByWorkspace(ctx context.Context, workspaceID uuid.UUID) (int64, error) {
	return s.projectRepo.CountByWorkspace(ctx, workspaceID)
}
