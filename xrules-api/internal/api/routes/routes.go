package routes

import (
	"xrules-api/internal/api/handlers"
	"xrules-api/internal/api/middleware"
	"xrules-api/internal/service"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// Setup configures all routes
func Setup(
	router *gin.Engine,
	services *service.Services,
	mw *middleware.Middleware,
	logger *zap.Logger,
) {
	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// API routes
	api := router.Group("/api")
	{
		// Auth routes
		setupAuthRoutes(api, services, mw)

		// Protected routes
		protected := api.Group("")
		protected.Use(mw.Auth())
		{
			setupUserRoutes(protected, services, mw)
			setupWorkspaceRoutes(protected, services, mw)
			setupProjectRoutes(protected, services, mw)
		}
	}
}

func setupAuthRoutes(
	rg *gin.RouterGroup,
	services *service.Services,
	mw *middleware.Middleware,
) {
	authHandler := handlers.NewAuthHandler(services.Auth, services.OAuth)
	oauthMW := middleware.NewOAuthMiddleware(services.OAuth)

	auth := rg.Group("/auth")
	{
		// Standard auth
		auth.POST("/register", authHandler.Register)
		auth.POST("/login", authHandler.Login)
		auth.POST("/refresh", authHandler.Refresh)

		// OAuth providers
		auth.GET("/oauth/providers", authHandler.GetOAuthProviders)

		// OAuth login (initiates flow)
		auth.GET("/oauth/:provider/login",
			oauthMW.ValidateProvider(),
			oauthMW.CheckProviderEnabled(),
			authHandler.OAuthLogin)

		// OAuth callback
		auth.GET("/oauth/:provider/callback",
			oauthMW.ValidateProvider(),
			authHandler.OAuthCallback)

		// Protected auth routes
		protected := auth.Group("")
		protected.Use(mw.Auth())
		{
			protected.POST("/logout", authHandler.Logout)
			protected.GET("/me", authHandler.GetMe)
			protected.POST("/change-password", authHandler.ChangePassword)

			// OAuth account management
			protected.GET("/oauth/accounts", authHandler.GetMyOAuthAccounts)
			protected.POST("/oauth/link", authHandler.LinkOAuthAccount)
			protected.DELETE("/oauth/accounts/:accountID", authHandler.UnlinkOAuthAccount)
		}
	}
}

func setupUserRoutes(
	rg *gin.RouterGroup,
	services *service.Services,
	mw *middleware.Middleware,
) {
	// User routes will be added here
	users := rg.Group("/users")
	{
		users.GET("/:id", func(c *gin.Context) {
			c.JSON(200, gin.H{"message": "get user"})
		})
	}
}

func setupWorkspaceRoutes(
	rg *gin.RouterGroup,
	services *service.Services,
	mw *middleware.Middleware,
) {
	workspaces := rg.Group("/workspaces")
	{
		workspaces.GET("", func(c *gin.Context) {
			c.JSON(200, gin.H{"message": "list workspaces"})
		})
		workspaces.POST("", func(c *gin.Context) {
			c.JSON(201, gin.H{"message": "create workspace"})
		})
	}
}

func setupProjectRoutes(
	rg *gin.RouterGroup,
	services *service.Services,
	mw *middleware.Middleware,
) {
	projects := rg.Group("/projects")
	{
		projects.GET("", func(c *gin.Context) {
			c.JSON(200, gin.H{"message": "list projects"})
		})
		projects.POST("", func(c *gin.Context) {
			c.JSON(201, gin.H{"message": "create project"})
		})
	}
}
