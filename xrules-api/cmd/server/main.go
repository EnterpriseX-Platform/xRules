package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"xrules-api/internal/api/middleware"
	"xrules-api/internal/api/routes"
	"xrules-api/internal/config"
	"xrules-api/internal/infra/cache"
	"xrules-api/internal/infra/database"
	"xrules-api/internal/infra/http"
	"xrules-api/internal/repository"
	"xrules-api/internal/service"

	"go.uber.org/zap"
)

func main() {
	// Initialize logger
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		logger.Fatal("Failed to load config", zap.Error(err))
	}

	// Initialize database
	db, err := database.New(cfg.Database)
	if err != nil {
		logger.Fatal("Failed to connect to database", zap.Error(err))
	}

	// Run migrations
	if err := database.Migrate(cfg.Database); err != nil {
		logger.Fatal("Failed to run migrations", zap.Error(err))
	}

	// Initialize Redis cache
	redisClient, err := cache.New(cfg.Redis)
	if err != nil {
		logger.Fatal("Failed to connect to Redis", zap.Error(err))
	}
	defer redisClient.Close()

	// Initialize repositories
	repos := repository.NewRepositories(db)

	// Initialize services
	services := service.NewServices(repos, redisClient, cfg, logger)

	// Initialize middleware
	mw := middleware.NewMiddleware(services.Auth, cfg, logger)

	// Create HTTP server
	server := httpserver.New(cfg.Server)

	// Setup routes
	routes.Setup(server.Engine, services, mw, logger)

	// Start server in a goroutine
	go func() {
		logger.Info("Starting server", zap.String("address", cfg.Server.Address))
		if err := server.Start(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Failed to start server", zap.Error(err))
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Fatal("Server forced to shutdown", zap.Error(err))
	}

	logger.Info("Server exited gracefully")
}
