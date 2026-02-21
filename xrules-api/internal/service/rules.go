package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"xrules-api/internal/domain/execution"
	"xrules-api/internal/domain/project"
	"xrules-api/internal/domain/rules"
	"xrules-api/internal/domain/webhook"
	"xrules-api/internal/infra/cache"
	"xrules-api/internal/repository"
	apperrors "xrules-api/pkg/errors"

	"github.com/google/uuid"
)

// RulesService defines the rules service interface
type RulesService interface {
	Create(ctx context.Context, projectID, userID uuid.UUID, req *rules.CreateRulesProjectRequest) (*rules.RulesProject, error)
	GetByID(ctx context.Context, id uuid.UUID) (*rules.RulesProject, error)
	ListByProject(ctx context.Context, projectID uuid.UUID, status rules.Status, page, limit int, search string) (*rules.ListRulesResponse, error)
	Update(ctx context.Context, id uuid.UUID, userID uuid.UUID, req *rules.UpdateRulesProjectRequest) (*rules.RulesProject, error)
	Delete(ctx context.Context, id uuid.UUID, userID uuid.UUID) error
	UpdateStatus(ctx context.Context, id uuid.UUID, userID uuid.UUID, status rules.Status) error
	Execute(ctx context.Context, id uuid.UUID, userID uuid.UUID, req *rules.ExecuteRulesRequest) (*execution.Execution, error)
	Validate(ctx context.Context, nodes rules.Nodes, edges rules.Edges) error
	SetWebhookService(webhookSvc WebhookService)
}

// rulesService implements RulesService
type rulesService struct {
	rulesRepo      repository.RulesRepository
	projectRepo    repository.ProjectRepository
	workspaceRepo  repository.WorkspaceRepository
	executionRepo  repository.ExecutionRepository
	webhookService WebhookService
	cache          *cache.Cache
}

// NewRulesService creates a new rules service
func NewRulesService(rulesRepo repository.RulesRepository, projectRepo repository.ProjectRepository, workspaceRepo repository.WorkspaceRepository, executionRepo repository.ExecutionRepository, cache *cache.Cache) RulesService {
	return &rulesService{
		rulesRepo:     rulesRepo,
		projectRepo:   projectRepo,
		workspaceRepo: workspaceRepo,
		executionRepo: executionRepo,
		cache:         cache,
	}
}

// SetWebhookService sets the webhook service for triggering webhooks
func (s *rulesService) SetWebhookService(webhookSvc WebhookService) {
	s.webhookService = webhookSvc
}

func (s *rulesService) Create(ctx context.Context, projectID, userID uuid.UUID, req *rules.CreateRulesProjectRequest) (*rules.RulesProject, error) {
	// Get project
	p, err := s.projectRepo.GetByID(ctx, projectID)
	if err != nil {
		return nil, err
	}

	// Check permissions
	if ok, err := s.workspaceRepo.HasPermission(ctx, p.WorkspaceID, userID, "member"); err != nil || !ok {
		if err != nil {
			return nil, err
		}
		return nil, apperrors.NewForbiddenError("you don't have permission to create rules in this project")
	}

	// Check workspace limits
	workspace, err := s.workspaceRepo.GetByID(ctx, p.WorkspaceID)
	if err != nil {
		return nil, err
	}

	count, err := s.rulesRepo.CountByProject(ctx, projectID)
	if err != nil {
		return nil, err
	}

	if workspace.Settings.MaxRulesPerProject > 0 && count >= int64(workspace.Settings.MaxRulesPerProject) {
		return nil, apperrors.NewForbiddenError("maximum number of rules projects reached")
	}

	rp := &rules.RulesProject{
		ProjectID:   projectID,
		Name:        req.Name,
		Description: req.Description,
		Nodes:       req.Nodes,
		Edges:       req.Edges,
		Status:      rules.StatusDraft,
		Settings:    req.Settings,
		CreatedBy:   userID,
	}

	if err := s.rulesRepo.Create(ctx, rp); err != nil {
		return nil, err
	}

	return rp, nil
}

func (s *rulesService) GetByID(ctx context.Context, id uuid.UUID) (*rules.RulesProject, error) {
	// Try cache first
	var rp rules.RulesProject
	cacheKey := fmt.Sprintf("rules:%s", id.String())
	if err := s.cache.GetJSON(ctx, cacheKey, &rp); err == nil {
		return &rp, nil
	}

	// Get from database
	rpDB, err := s.rulesRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Cache it
	s.cache.SetJSON(ctx, cacheKey, rpDB, 5*time.Minute)

	return rpDB, nil
}

func (s *rulesService) ListByProject(ctx context.Context, projectID uuid.UUID, status rules.Status, page, limit int, search string) (*rules.ListRulesResponse, error) {
	pagination := repository.NewPagination(page, limit)

	var rulesProjects []*rules.RulesProject
	var total int64
	var err error

	if status != "" {
		rulesProjects, total, err = s.rulesRepo.GetByProjectAndStatus(ctx, projectID, status, pagination)
	} else if search != "" {
		rulesProjects, total, err = s.rulesRepo.Search(ctx, projectID, search, pagination)
	} else {
		rulesProjects, total, err = s.rulesRepo.GetByProject(ctx, projectID, pagination)
	}

	if err != nil {
		return nil, err
	}

	responses := make([]*rules.RulesProjectResponse, len(rulesProjects))
	for i, rp := range rulesProjects {
		resp := rp.ToResponse()
		// Get execution stats
		count, _ := s.executionRepo.GetStats(ctx, rp.ID, time.Now().AddDate(0, -1, 0), time.Now())
		if count != nil {
			resp.ExecutionCount = count.TotalCount
		}
		responses[i] = resp
	}

	totalPages := int(total) / limit
	if int(total)%limit > 0 {
		totalPages++
	}

	return &rules.ListRulesResponse{
		Data:       responses,
		Total:      total,
		Page:       page,
		Limit:      limit,
		TotalPages: totalPages,
	}, nil
}

func (s *rulesService) Update(ctx context.Context, id uuid.UUID, userID uuid.UUID, req *rules.UpdateRulesProjectRequest) (*rules.RulesProject, error) {
	rp, err := s.rulesRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Get project to check workspace
	p, err := s.projectRepo.GetByID(ctx, rp.ProjectID)
	if err != nil {
		return nil, err
	}

	// Check permissions
	if ok, err := s.workspaceRepo.HasPermission(ctx, p.WorkspaceID, userID, "member"); err != nil || !ok {
		if err != nil {
			return nil, err
		}
		return nil, apperrors.NewForbiddenError("you don't have permission to update this rules project")
	}

	if req.Name != "" {
		rp.Name = req.Name
	}
	if req.Description != "" {
		rp.Description = req.Description
	}
	if req.Nodes != nil {
		rp.Nodes = *req.Nodes
	}
	if req.Edges != nil {
		rp.Edges = *req.Edges
	}
	if req.Status != nil {
		rp.Status = *req.Status
	}
	if req.Settings.Timeout > 0 {
		rp.Settings = req.Settings
	}

	rp.UpdatedBy = userID

	if err := s.rulesRepo.Update(ctx, rp); err != nil {
		return nil, err
	}

	// Invalidate cache
	s.invalidateCache(ctx, id)

	return rp, nil
}

func (s *rulesService) Delete(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	rp, err := s.rulesRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	// Get project to check workspace
	p, err := s.projectRepo.GetByID(ctx, rp.ProjectID)
	if err != nil {
		return err
	}

	// Check permissions
	if ok, err := s.workspaceRepo.HasPermission(ctx, p.WorkspaceID, userID, "admin"); err != nil || !ok {
		if err != nil {
			return err
		}
		return apperrors.NewForbiddenError("you don't have permission to delete this rules project")
	}

	// Delete associated executions
	if err := s.executionRepo.DeleteByRulesProject(ctx, id); err != nil {
		return err
	}

	// Delete rules project
	if err := s.rulesRepo.Delete(ctx, id); err != nil {
		return err
	}

	// Invalidate cache
	s.invalidateCache(ctx, id)

	return nil
}

func (s *rulesService) UpdateStatus(ctx context.Context, id uuid.UUID, userID uuid.UUID, status rules.Status) error {
	rp, err := s.rulesRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	// Get project to check workspace
	p, err := s.projectRepo.GetByID(ctx, rp.ProjectID)
	if err != nil {
		return err
	}

	// Check permissions
	if ok, err := s.workspaceRepo.HasPermission(ctx, p.WorkspaceID, userID, "member"); err != nil || !ok {
		if err != nil {
			return err
		}
		return apperrors.NewForbiddenError("you don't have permission to update this rules project")
	}

	rp.Status = status
	rp.UpdatedBy = userID

	if err := s.rulesRepo.UpdateStatus(ctx, id, status); err != nil {
		return err
	}

	// Invalidate cache
	s.invalidateCache(ctx, id)

	return nil
}

func (s *rulesService) Execute(ctx context.Context, id uuid.UUID, userID uuid.UUID, req *rules.ExecuteRulesRequest) (*execution.Execution, error) {
	rp, err := s.rulesRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Check if active
	if rp.Status != rules.StatusActive {
		return nil, apperrors.NewBadRequestError("rules project is not active")
	}

	// Get project to check workspace
	p, err := s.projectRepo.GetByID(ctx, rp.ProjectID)
	if err != nil {
		return nil, err
	}

	// Check permissions
	if ok, err := s.workspaceRepo.HasPermission(ctx, p.WorkspaceID, userID, "member"); err != nil || !ok {
		if err != nil {
			return nil, err
		}
		return nil, apperrors.NewForbiddenError("you don't have permission to execute this rules project")
	}

	// Create execution
	e := &execution.Execution{
		RulesProjectID: id,
		Status:         execution.StatusPending,
		Input:          req.Input,
		Context: execution.Context{
			Environment:   req.Environment,
			Variables:     make(map[string]interface{}),
			ConnectionIDs: make(map[string]uuid.UUID),
		},
		NodeResults: make(execution.NodeResults),
		CreatedBy:   userID,
	}

	if err := s.executionRepo.Create(ctx, e); err != nil {
		return nil, err
	}

	// Start execution (in production, this would be async via message queue)
	go s.runExecution(e, rp)

	return e, nil
}

func (s *rulesService) Validate(ctx context.Context, nodes rules.Nodes, edges rules.Edges) error {
	// Basic validation
	if len(nodes) == 0 {
		return apperrors.NewValidationError("rules project must have at least one node")
	}

	// Check for start node
	hasStart := false
	for _, node := range nodes {
		if node.Type == "start" || node.Type == "trigger" {
			hasStart = true
			break
		}
	}
	if !hasStart {
		return apperrors.NewValidationError("rules project must have a start/trigger node")
	}

	// Check for disconnected nodes
	connectedNodes := make(map[string]bool)
	for _, edge := range edges {
		connectedNodes[edge.Source] = true
		connectedNodes[edge.Target] = true
	}

	for _, node := range nodes {
		if node.Type != "start" && node.Type != "trigger" && !connectedNodes[node.ID] {
			return apperrors.NewValidationError(fmt.Sprintf("node %s (%s) is disconnected", node.ID, node.Label))
		}
	}

	return nil
}

func (s *rulesService) runExecution(e *execution.Execution, rp *rules.RulesProject) {
	// This is a simplified execution runner
	// In production, this would be handled by a proper execution engine
	ctx := context.Background()

	// Trigger execution started webhook
	if s.webhookService != nil {
		s.webhookService.TriggerWebhookAsync(ctx, rp.ProjectID, webhook.EventExecutionStarted, map[string]any{
			"execution_id": e.ID.String(),
			"rules_project": map[string]any{
				"id":   rp.ID.String(),
				"name": rp.Name,
			},
			"started_at": time.Now().UTC(),
		})
	}

	// Update status to running
	e.Start()
	s.executionRepo.Update(ctx, e)

	// Simulate execution
	time.Sleep(100 * time.Millisecond)

	// Process nodes
	for _, node := range rp.Nodes {
		result := execution.NodeResult{
			NodeID:    node.ID,
			NodeType:  node.Type,
			Status:    "success",
			StartedAt: time.Now(),
			EndedAt:   time.Now(),
			Duration:  10,
			Output:    map[string]interface{}{"status": "ok"},
		}
		e.AddNodeResult(result)

		// Add log
		log := &execution.Log{
			ExecutionID: e.ID,
			Level:       execution.LogLevelInfo,
			NodeID:      node.ID,
			Message:     fmt.Sprintf("Executed node %s (%s)", node.Label, node.Type),
			Timestamp:   time.Now(),
		}
		s.executionRepo.AddLog(ctx, log)
	}

	// Complete execution
	output := execution.Output{
		"status":       "completed",
		"nodesExecuted": len(rp.Nodes),
	}
	e.Complete(output)
	s.executionRepo.Update(ctx, e)

	// Trigger execution completed webhook
	if s.webhookService != nil {
		s.webhookService.TriggerWebhookAsync(ctx, rp.ProjectID, webhook.EventExecutionCompleted, map[string]any{
			"execution_id": e.ID.String(),
			"rules_project": map[string]any{
				"id":   rp.ID.String(),
				"name": rp.Name,
			},
			"status":     string(e.Status),
			"duration":   e.Duration,
			"completed_at": time.Now().UTC(),
			"output":     output,
		})
	}
}

func (s *rulesService) invalidateCache(ctx context.Context, id uuid.UUID) {
	cacheKey := fmt.Sprintf("rules:%s", id.String())
	s.cache.Delete(ctx, cacheKey)
}
