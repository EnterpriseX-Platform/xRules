package handlers

import (
	"net/http"

	"xrules-api/internal/domain/user"
	"xrules-api/internal/service"
	apperrors "xrules-api/pkg/errors"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ErrorResponse represents an error response
type ErrorResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// AuthHandler handles auth requests
type AuthHandler struct {
	authService  service.AuthService
	oauthService service.OAuthService
}

// NewAuthHandler creates a new auth handler
func NewAuthHandler(authService service.AuthService, oauthService service.OAuthService) *AuthHandler {
	return &AuthHandler{
		authService:  authService,
		oauthService: oauthService,
	}
}

// RegisterRequest represents registration request
type RegisterRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
	Name     string `json:"name" binding:"required"`
}

// LoginRequest represents login request
type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// RefreshRequest represents refresh token request
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

// OAuthCallbackRequest represents OAuth callback request
type OAuthCallbackRequest struct {
	Code  string `form:"code" binding:"required"`
	State string `form:"state" binding:"required"`
}

// OAuthLinkRequest represents OAuth account link request
type OAuthLinkRequest struct {
	Provider   string `json:"provider" binding:"required,oneof=google github microsoft oidc"`
	Code       string `json:"code" binding:"required"`
	State      string `json:"state" binding:"required"`
}

// AuthResponse represents auth response
type AuthResponse struct {
	User         *user.UserResponse `json:"user"`
	AccessToken  string             `json:"access_token"`
	RefreshToken string             `json:"refresh_token"`
	ExpiresAt    interface{}        `json:"expires_at"`
}

// Register handles user registration
func (h *AuthHandler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		handleValidationError(c, err)
		return
	}

	createReq := &user.CreateUserRequest{
		Email:    req.Email,
		Password: req.Password,
		Name:     req.Name,
	}

	u, tokens, err := h.authService.Register(c.Request.Context(), createReq)
	if err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusCreated, AuthResponse{
		User:         u.ToResponse(),
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		ExpiresAt:    tokens.ExpiresAt,
	})
}

// Login handles user login
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		handleValidationError(c, err)
		return
	}

	loginReq := &user.LoginRequest{
		Email:    req.Email,
		Password: req.Password,
	}

	u, tokens, err := h.authService.Login(c.Request.Context(), loginReq)
	if err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, AuthResponse{
		User:         u.ToResponse(),
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		ExpiresAt:    tokens.ExpiresAt,
	})
}

// Refresh handles token refresh
func (h *AuthHandler) Refresh(c *gin.Context) {
	var req RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		handleValidationError(c, err)
		return
	}

	tokens, err := h.authService.RefreshToken(c.Request.Context(), req.RefreshToken)
	if err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token":  tokens.AccessToken,
		"refresh_token": tokens.RefreshToken,
		"expires_at":    tokens.ExpiresAt,
	})
}

// Logout handles user logout
func (h *AuthHandler) Logout(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		handleError(c, err)
		return
	}

	if err := h.authService.Logout(c.Request.Context(), *userID); err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "logged out successfully"})
}

// GetMe returns current user info
func (h *AuthHandler) GetMe(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		handleError(c, err)
		return
	}

	u, err := h.authService.GetCurrentUser(c.Request.Context(), *userID)
	if err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, u.ToResponse())
}

// ChangePassword handles password change
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		handleError(c, err)
		return
	}

	var req user.ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		handleValidationError(c, err)
		return
	}

	if err := h.authService.ChangePassword(c.Request.Context(), *userID, &req); err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "password changed successfully"})
}

// OAuthLogin initiates OAuth login flow
func (h *AuthHandler) OAuthLogin(c *gin.Context) {
	provider := c.Param("provider")
	redirectURI := c.Query("redirect_uri")

	oauthProvider := user.OAuthProvider(provider)
	if !h.oauthService.IsProviderEnabled(oauthProvider) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "OAuth provider not enabled"})
		return
	}

	authURL, state, err := h.oauthService.GetAuthURL(oauthProvider, redirectURI)
	if err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"auth_url": authURL,
		"state":    state,
	})
}

// OAuthCallback handles OAuth callback
func (h *AuthHandler) OAuthCallback(c *gin.Context) {
	provider := c.Param("provider")
	var req OAuthCallbackRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		handleValidationError(c, err)
		return
	}

	oauthProvider := user.OAuthProvider(provider)
	if !h.oauthService.IsProviderEnabled(oauthProvider) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "OAuth provider not enabled"})
		return
	}

	// Exchange code for user info
	userInfo, err := h.oauthService.ExchangeCode(c.Request.Context(), oauthProvider, req.Code, req.State, "")
	if err != nil {
		handleError(c, err)
		return
	}

	// Login or create user
	u, tokens, err := h.authService.OAuthLogin(c.Request.Context(), oauthProvider, userInfo)
	if err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, AuthResponse{
		User:         u.ToResponse(),
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		ExpiresAt:    tokens.ExpiresAt,
	})
}

// GetOAuthProviders returns enabled OAuth providers
func (h *AuthHandler) GetOAuthProviders(c *gin.Context) {
	providers := h.oauthService.GetSupportedProviders()
	providerList := make([]gin.H, 0, len(providers))

	for _, p := range providers {
		name := string(p)
		displayName := name
		switch p {
		case user.OAuthProviderGoogle:
			displayName = "Google"
		case user.OAuthProviderGitHub:
			displayName = "GitHub"
		case user.OAuthProviderMicrosoft:
			displayName = "Microsoft"
		case user.OAuthProviderOIDC:
			displayName = "Single Sign-On"
		}

		providerList = append(providerList, gin.H{
			"id":           name,
			"name":         displayName,
			"display_name": displayName,
		})
	}

	c.JSON(http.StatusOK, gin.H{"providers": providerList})
}

// GetMyOAuthAccounts returns current user's linked OAuth accounts
func (h *AuthHandler) GetMyOAuthAccounts(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		handleError(c, err)
		return
	}

	accounts, err := h.authService.GetUserOAuthAccounts(c.Request.Context(), *userID)
	if err != nil {
		handleError(c, err)
		return
	}

	// Convert to response format (hide sensitive fields)
	response := make([]gin.H, 0, len(accounts))
	for _, acc := range accounts {
		response = append(response, gin.H{
			"id":          acc.ID,
			"provider":    acc.Provider,
			"email":       acc.Email,
			"name":        acc.Name,
			"created_at":  acc.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{"accounts": response})
}

// LinkOAuthAccount links an OAuth account to current user
func (h *AuthHandler) LinkOAuthAccount(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		handleError(c, err)
		return
	}

	var req OAuthLinkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		handleValidationError(c, err)
		return
	}

	oauthProvider := user.OAuthProvider(req.Provider)
	if !h.oauthService.IsProviderEnabled(oauthProvider) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "OAuth provider not enabled"})
		return
	}

	// Exchange code for user info
	userInfo, err := h.oauthService.ExchangeCode(c.Request.Context(), oauthProvider, req.Code, req.State, "")
	if err != nil {
		handleError(c, err)
		return
	}

	// Link account
	if err := h.authService.LinkOAuthAccount(c.Request.Context(), *userID, oauthProvider, userInfo); err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "OAuth account linked successfully"})
}

// UnlinkOAuthAccount unlinks an OAuth account
func (h *AuthHandler) UnlinkOAuthAccount(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		handleError(c, err)
		return
	}

	accountIDStr := c.Param("accountID")
	accountID, err := uuid.Parse(accountIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account ID"})
		return
	}

	if err := h.authService.UnlinkOAuthAccount(c.Request.Context(), *userID, accountID); err != nil {
		handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "OAuth account unlinked successfully"})
}

// Helper functions
func getUserID(c *gin.Context) (*uuid.UUID, error) {
	userID, exists := c.Get("userID")
	if !exists {
		return nil, apperrors.NewUnauthorizedError("user not authenticated")
	}

	id, ok := userID.(uuid.UUID)
	if !ok {
		return nil, apperrors.NewInternalError(nil)
	}

	return &id, nil
}

func handleValidationError(c *gin.Context, err error) {
	c.JSON(http.StatusBadRequest, gin.H{
		"error":   "validation error",
		"message": err.Error(),
	})
}

func handleError(c *gin.Context, err error) {
	if appErr, ok := err.(*apperrors.AppError); ok {
		c.JSON(appErr.HTTPStatus(), gin.H{
			"error":   appErr.Code,
			"message": appErr.Message,
		})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{
		"error":   "internal_error",
		"message": err.Error(),
	})
}
