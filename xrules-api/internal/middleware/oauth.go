package middleware

import (
	"net/http"
	"strings"

	"xrules-api/internal/domain/user"
	"xrules-api/internal/service"
	apperrors "xrules-api/pkg/errors"

	"github.com/gin-gonic/gin"
)

// OAuthMiddleware handles OAuth-specific middleware
type OAuthMiddleware struct {
	oauthService service.OAuthService
}

// NewOAuthMiddleware creates a new OAuth middleware
func NewOAuthMiddleware(oauthService service.OAuthService) *OAuthMiddleware {
	return &OAuthMiddleware{
		oauthService: oauthService,
	}
}

// ValidateState validates the OAuth state parameter
func (m *OAuthMiddleware) ValidateState() gin.HandlerFunc {
	return func(c *gin.Context) {
		state := c.Query("state")
		if state == "" {
			state = c.PostForm("state")
		}

		if state == "" {
			c.AbortWithStatusJSON(http.StatusBadRequest, ErrorResponse{
				Code:    apperrors.ErrCodeValidation,
				Message: "state parameter is required",
			})
			return
		}

		valid, err := m.oauthService.ValidateState(c.Request.Context(), state)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, ErrorResponse{
				Code:    apperrors.ErrCodeInternal,
				Message: "failed to validate state",
			})
			return
		}

		if !valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, ErrorResponse{
				Code:    apperrors.ErrCodeUnauthorized,
				Message: "invalid or expired state",
			})
			return
		}

		c.Next()
	}
}

// ValidateProvider validates the OAuth provider
func (m *OAuthMiddleware) ValidateProvider() gin.HandlerFunc {
	return func(c *gin.Context) {
		provider := c.Param("provider")
		if provider == "" {
			c.AbortWithStatusJSON(http.StatusBadRequest, ErrorResponse{
				Code:    apperrors.ErrCodeValidation,
				Message: "provider is required",
			})
			return
		}

		validProviders := map[string]bool{
			string(user.OAuthProviderGoogle):    true,
			string(user.OAuthProviderGitHub):    true,
			string(user.OAuthProviderMicrosoft): true,
			string(user.OAuthProviderOIDC):      true,
		}

		if !validProviders[strings.ToLower(provider)] {
			c.AbortWithStatusJSON(http.StatusBadRequest, ErrorResponse{
				Code:    apperrors.ErrCodeValidation,
				Message: "unsupported OAuth provider",
			})
			return
		}

		c.Next()
	}
}

// CheckProviderEnabled checks if the OAuth provider is enabled
func (m *OAuthMiddleware) CheckProviderEnabled() gin.HandlerFunc {
	return func(c *gin.Context) {
		provider := c.Param("provider")
		oauthProvider := user.OAuthProvider(provider)

		if !m.oauthService.IsProviderEnabled(oauthProvider) {
			c.AbortWithStatusJSON(http.StatusBadRequest, ErrorResponse{
				Code:    apperrors.ErrCodeBadRequest,
				Message: "OAuth provider is not enabled",
			})
			return
		}

		c.Next()
	}
}
