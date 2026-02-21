package httpserver

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"xrules-api/internal/config"

	"github.com/gin-gonic/gin"
)

// Server represents the HTTP server
type Server struct {
	Engine *gin.Engine
	server *http.Server
	cfg    config.ServerConfig
}

// New creates a new HTTP server
func New(cfg config.ServerConfig) *Server {
	// Set Gin mode
	gin.SetMode(cfg.Mode)

	engine := gin.New()

	return &Server{
		Engine: engine,
		cfg:    cfg,
	}
}

// Start starts the HTTP server
func (s *Server) Start() error {
	s.server = &http.Server{
		Addr:         fmt.Sprintf("%s:%d", s.cfg.Address, s.cfg.Port),
		Handler:      s.Engine,
		ReadTimeout:  time.Duration(s.cfg.ReadTimeout) * time.Second,
		WriteTimeout: time.Duration(s.cfg.WriteTimeout) * time.Second,
	}

	return s.server.ListenAndServe()
}

// Shutdown gracefully shuts down the server
func (s *Server) Shutdown(ctx context.Context) error {
	if s.server == nil {
		return nil
	}
	return s.server.Shutdown(ctx)
}

// HealthHandler returns a health check handler
func HealthHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "healthy",
			"timestamp": time.Now().UTC(),
		})
	}
}
