package middleware

import (
	"net/http"
	"strings"
	"time"

	"xrules-api/internal/config"
	"xrules-api/internal/service"
	apperrors "xrules-api/pkg/errors"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// Middleware holds all middleware functions
type Middleware struct {
	authService service.AuthService
	cfg         *config.Config
	logger      *zap.Logger
}

// NewMiddleware creates a new middleware instance
func NewMiddleware(authService service.AuthService, cfg *config.Config, logger *zap.Logger) *Middleware {
	return &Middleware{
		authService: authService,
		cfg:         cfg,
		logger:      logger,
	}
}

// ErrorResponse represents an error response
type ErrorResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Auth middleware validates JWT token
func (m *Middleware) Auth() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, ErrorResponse{
				Code:    apperrors.ErrCodeUnauthorized,
				Message: "authorization header required",
			})
			return
		}

		// Extract token
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, ErrorResponse{
				Code:    apperrors.ErrCodeUnauthorized,
				Message: "invalid authorization header format",
			})
			return
		}

		token := parts[1]
		claims, err := m.authService.ValidateToken(token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, ErrorResponse{
				Code:    apperrors.ErrCodeUnauthorized,
				Message: "invalid or expired token",
			})
			return
		}

		// Set user info in context
		c.Set("userID", claims.UserID)
		c.Set("userEmail", claims.Email)
		c.Set("userRole", claims.Role)
		c.Next()
	}
}

// OptionalAuth middleware validates JWT token if present
func (m *Middleware) OptionalAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.Next()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			c.Next()
			return
		}

		token := parts[1]
		claims, err := m.authService.ValidateToken(token)
		if err != nil {
			c.Next()
			return
		}

		c.Set("userID", claims.UserID)
		c.Set("userEmail", claims.Email)
		c.Set("userRole", claims.Role)
		c.Next()
	}
}

// Logger middleware logs requests
func (m *Middleware) Logger() gin.HandlerFunc {
	return gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
		m.logger.Info("HTTP Request",
			zap.String("method", param.Method),
			zap.String("path", param.Path),
			zap.Int("status", param.StatusCode),
			zap.Duration("latency", param.Latency),
			zap.String("client_ip", param.ClientIP),
			zap.String("error", param.ErrorMessage),
		)
		return ""
	})
}

// Recovery middleware recovers from panics
func (m *Middleware) Recovery() gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, recovered interface{}) {
		m.logger.Error("Request panic recovered",
			zap.Any("error", recovered),
			zap.String("path", c.Request.URL.Path),
		)
		c.AbortWithStatusJSON(http.StatusInternalServerError, ErrorResponse{
			Code:    apperrors.ErrCodeInternal,
			Message: "internal server error",
		})
	})
}

// CORS middleware handles CORS
func (m *Middleware) CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Origin, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
		c.Writer.Header().Set("Access-Control-Expose-Headers", "Content-Length")
		c.Writer.Header().Set("Access-Control-Max-Age", "86400")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

// RateLimit middleware implements rate limiting
func (m *Middleware) RateLimit(requests int, window time.Duration) gin.HandlerFunc {
	// Simple in-memory rate limiter
	// In production, use Redis-based rate limiting
	clients := make(map[string][]time.Time)

	return func(c *gin.Context) {
		clientIP := c.ClientIP()
		now := time.Now()

		// Clean old entries
		var validRequests []time.Time
		if requests, ok := clients[clientIP]; ok {
			for _, t := range requests {
				if now.Sub(t) < window {
					validRequests = append(validRequests, t)
				}
			}
		}

		// Check limit
		if len(validRequests) >= requests {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, ErrorResponse{
				Code:    apperrors.ErrCodeRateLimit,
				Message: "rate limit exceeded",
			})
			return
		}

		// Add current request
		validRequests = append(validRequests, now)
		clients[clientIP] = validRequests

		c.Next()
	}
}

// RequestID middleware adds a request ID
func (m *Middleware) RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := c.GetHeader("X-Request-ID")
		if requestID == "" {
			requestID = generateRequestID()
		}
		c.Set("requestID", requestID)
		c.Writer.Header().Set("X-Request-ID", requestID)
		c.Next()
	}
}

// SecurityHeaders middleware adds security headers
func (m *Middleware) SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("X-Content-Type-Options", "nosniff")
		c.Writer.Header().Set("X-Frame-Options", "DENY")
		c.Writer.Header().Set("X-XSS-Protection", "1; mode=block")
		c.Writer.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		c.Writer.Header().Set("Content-Security-Policy", "default-src 'self'")
		c.Next()
	}
}

// WorkspacePermission middleware checks workspace permissions
func (m *Middleware) WorkspacePermission(workspaceService service.WorkspaceService, minRole string) gin.HandlerFunc {
	return func(c *gin.Context) {
		workspaceIDStr := c.Param("workspaceID")
		if workspaceIDStr == "" {
			workspaceIDStr = c.Query("workspace_id")
		}

		if workspaceIDStr == "" {
			c.AbortWithStatusJSON(http.StatusBadRequest, ErrorResponse{
				Code:    apperrors.ErrCodeBadRequest,
				Message: "workspace ID required",
			})
			return
		}

		workspaceID, err := parseUUID(workspaceIDStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, ErrorResponse{
				Code:    apperrors.ErrCodeValidation,
				Message: "invalid workspace ID",
			})
			return
		}

		userID := getUserID(c)
		if userID == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, ErrorResponse{
				Code:    apperrors.ErrCodeUnauthorized,
				Message: "authentication required",
			})
			return
		}

		hasPermission, err := workspaceService.HasPermission(c.Request.Context(), workspaceID, *userID, minRole)
		if err != nil || !hasPermission {
			c.AbortWithStatusJSON(http.StatusForbidden, ErrorResponse{
				Code:    apperrors.ErrCodeForbidden,
				Message: "insufficient permissions",
			})
			return
		}

		c.Set("workspaceID", workspaceID)
		c.Next()
	}
}

// Helper functions
func generateRequestID() string {
	return time.Now().Format("20060102150405") + randomString(8)
}

func randomString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[time.Now().UnixNano()%int64(len(letters))]
	}
	return string(b)
}

func parseUUID(s string) (interface{}, error) {
	// Implement UUID parsing
	return s, nil
}

func getUserID(c *gin.Context) *interface{} {
	if userID, exists := c.Get("userID"); exists {
		return &userID
	}
	return nil
}
