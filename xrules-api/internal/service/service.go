package service

import (
	"xrules-api/internal/config"
	"xrules-api/internal/domain/user"
	"xrules-api/internal/infra/cache"
	"xrules-api/internal/repository"

	"go.uber.org/zap"
)

// Services holds all services
type Services struct {
	Auth       AuthService
	OAuth      OAuthService
	User       UserService
	Workspace  WorkspaceService
	Project    ProjectService
	Rules      RulesService
	Connection ConnectionService
	Execution  ExecutionService
	Webhook    WebhookService
}

// NewServices creates all services
func NewServices(repos *repository.Repositories, cache *cache.Cache, cfg *config.Config, logger *zap.Logger) *Services {
	authService := NewAuthService(repos.User, cache, cfg.JWT)

	oauthService, err := NewOAuthService(cache, cfg.OAuth)
	if err != nil {
		logger.Error("Failed to initialize OAuth service", zap.Error(err))
		// Continue without OAuth - it's optional
		oauthService = &oauthService{
			cache:      cache,
			cfg:        cfg.OAuth,
			oauthConfs: make(map[user.OAuthProvider]*oauth2.Config),
		}
	}

	rulesService := NewRulesService(repos.Rules, repos.Project, repos.Workspace, repos.Execution, cache)
	webhookService := NewWebhookService(repos.Webhook, repos.Project, logger)

	// Set webhook service on rules service for triggering webhooks during execution
	rulesService.SetWebhookService(webhookService)

	return &Services{
		Auth:       authService,
		OAuth:      oauthService,
		User:       NewUserService(repos.User),
		Workspace:  NewWorkspaceService(repos.Workspace, cache),
		Project:    NewProjectService(repos.Project, repos.Workspace),
		Rules:      rulesService,
		Connection: NewConnectionService(repos.Connection),
		Execution:  NewExecutionService(repos.Execution, repos.Rules, cache, logger),
		Webhook:    webhookService,
	}
}
