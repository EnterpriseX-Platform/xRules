package repository

import (
	"gorm.io/gorm"
)

// Repositories holds all repositories
type Repositories struct {
	User       UserRepository
	Workspace  WorkspaceRepository
	Project    ProjectRepository
	Rules      RulesRepository
	Connection ConnectionRepository
	Execution  ExecutionRepository
	Webhook    WebhookRepository
}

// NewRepositories creates all repositories
func NewRepositories(db *gorm.DB) *Repositories {
	return &Repositories{
		User:       NewUserRepository(db),
		Workspace:  NewWorkspaceRepository(db),
		Project:    NewProjectRepository(db),
		Rules:      NewRulesRepository(db),
		Connection: NewConnectionRepository(db),
		Execution:  NewExecutionRepository(db),
		Webhook:    NewWebhookRepository(db),
	}
}

// Pagination represents pagination parameters
type Pagination struct {
	Page  int
	Limit int
	Offset int
}

// NewPagination creates a new pagination
func NewPagination(page, limit int) Pagination {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	return Pagination{
		Page:   page,
		Limit:  limit,
		Offset: (page - 1) * limit,
	}
}

// PaginatedResult represents a paginated result
type PaginatedResult struct {
	Data       interface{}
	Total      int64
	Page       int
	Limit      int
	TotalPages int
}

// NewPaginatedResult creates a new paginated result
func NewPaginatedResult(data interface{}, total int64, page, limit int) *PaginatedResult {
	totalPages := int(total) / limit
	if int(total)%limit > 0 {
		totalPages++
	}
	return &PaginatedResult{
		Data:       data,
		Total:      total,
		Page:       page,
		Limit:      limit,
		TotalPages: totalPages,
	}
}
