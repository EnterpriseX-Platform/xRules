package service

import (
	"context"
	"fmt"
	"time"

	"xrules-api/internal/config"
	"xrules-api/internal/domain/user"
	"xrules-api/internal/infra/cache"
	"xrules-api/internal/repository"
	apperrors "xrules-api/pkg/errors"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// TokenPair represents access and refresh tokens
type TokenPair struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token"`
	ExpiresAt    time.Time `json:"expires_at"`
}

// Claims represents JWT claims
type Claims struct {
	UserID uuid.UUID `json:"user_id"`
	Email  string    `json:"email"`
	Role   user.Role `json:"role"`
	jwt.RegisteredClaims
}

// AuthService defines the auth service interface
type AuthService interface {
	Register(ctx context.Context, req *user.CreateUserRequest) (*user.User, *TokenPair, error)
	Login(ctx context.Context, req *user.LoginRequest) (*user.User, *TokenPair, error)
	RefreshToken(ctx context.Context, refreshToken string) (*TokenPair, error)
	Logout(ctx context.Context, userID uuid.UUID) error
	ValidateToken(tokenString string) (*Claims, error)
	GetCurrentUser(ctx context.Context, userID uuid.UUID) (*user.User, error)
	ChangePassword(ctx context.Context, userID uuid.UUID, req *user.ChangePasswordRequest) error

	// OAuth methods
	OAuthLogin(ctx context.Context, provider user.OAuthProvider, userInfo *user.OAuthUserInfo) (*user.User, *TokenPair, error)
	LinkOAuthAccount(ctx context.Context, userID uuid.UUID, provider user.OAuthProvider, userInfo *user.OAuthUserInfo) error
	UnlinkOAuthAccount(ctx context.Context, userID uuid.UUID, accountID uuid.UUID) error
	GetUserOAuthAccounts(ctx context.Context, userID uuid.UUID) ([]user.OAuthAccount, error)
}

// authService implements AuthService
type authService struct {
	userRepo repository.UserRepository
	cache    *cache.Cache
	jwtCfg   config.JWTConfig
}

// NewAuthService creates a new auth service
func NewAuthService(userRepo repository.UserRepository, cache *cache.Cache, jwtCfg config.JWTConfig) AuthService {
	return &authService{
		userRepo: userRepo,
		cache:    cache,
		jwtCfg:   jwtCfg,
	}
}

func (s *authService) Register(ctx context.Context, req *user.CreateUserRequest) (*user.User, *TokenPair, error) {
	// Check if user already exists
	_, err := s.userRepo.GetByEmail(ctx, req.Email)
	if err == nil {
		return nil, nil, apperrors.NewConflictError("user with this email already exists")
	}
	if !apperrors.IsNotFound(err) {
		return nil, nil, err
	}

	// Create user
	u := &user.User{
		Email: req.Email,
		Name:  req.Name,
		Role:  user.RoleUser,
	}

	if err := u.SetPassword(req.Password); err != nil {
		return nil, nil, apperrors.NewInternalError(err)
	}

	if err := s.userRepo.Create(ctx, u); err != nil {
		return nil, nil, err
	}

	// Generate tokens
	tokens, err := s.generateTokenPair(u)
	if err != nil {
		return nil, nil, err
	}

	return u, tokens, nil
}

func (s *authService) Login(ctx context.Context, req *user.LoginRequest) (*user.User, *TokenPair, error) {
	// Find user
	u, err := s.userRepo.GetByEmail(ctx, req.Email)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return nil, nil, apperrors.NewUnauthorizedError("invalid credentials")
		}
		return nil, nil, err
	}

	// Check password
	if !u.CheckPassword(req.Password) {
		return nil, nil, apperrors.NewUnauthorizedError("invalid credentials")
	}

	// Update last login
	if err := s.userRepo.UpdateLastLogin(ctx, u.ID); err != nil {
		// Log but don't fail
	}

	// Generate tokens
	tokens, err := s.generateTokenPair(u)
	if err != nil {
		return nil, nil, err
	}

	return u, tokens, nil
}

func (s *authService) RefreshToken(ctx context.Context, refreshToken string) (*TokenPair, error) {
	// Parse and validate refresh token
	claims, err := s.parseToken(refreshToken)
	if err != nil {
		return nil, apperrors.NewUnauthorizedError("invalid refresh token")
	}

	// Check if token is blacklisted
	key := fmt.Sprintf("blacklist:refresh:%s", refreshToken)
	exists, _ := s.cache.Exists(ctx, key)
	if exists {
		return nil, apperrors.NewUnauthorizedError("token has been revoked")
	}

	// Get user
	u, err := s.userRepo.GetByID(ctx, claims.UserID)
	if err != nil {
		return nil, err
	}

	// Generate new tokens
	tokens, err := s.generateTokenPair(u)
	if err != nil {
		return nil, err
	}

	// Blacklist old refresh token
	s.cache.Set(ctx, key, "revoked", time.Duration(s.jwtCfg.RefreshTokenTTL)*time.Second)

	return tokens, nil
}

func (s *authService) Logout(ctx context.Context, userID uuid.UUID) error {
	// Invalidate all user sessions by clearing cache
	pattern := fmt.Sprintf("user:%s:*", userID.String())
	return s.cache.DeletePattern(ctx, pattern)
}

func (s *authService) ValidateToken(tokenString string) (*Claims, error) {
	return s.parseToken(tokenString)
}

func (s *authService) GetCurrentUser(ctx context.Context, userID uuid.UUID) (*user.User, error) {
	return s.userRepo.GetByID(ctx, userID)
}

func (s *authService) ChangePassword(ctx context.Context, userID uuid.UUID, req *user.ChangePasswordRequest) error {
	u, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return err
	}

	// Verify current password
	if !u.CheckPassword(req.CurrentPassword) {
		return apperrors.NewUnauthorizedError("current password is incorrect")
	}

	// Set new password
	if err := u.SetPassword(req.NewPassword); err != nil {
		return apperrors.NewInternalError(err)
	}

	return s.userRepo.Update(ctx, u)
}

// OAuthLogin handles OAuth login/signup
func (s *authService) OAuthLogin(ctx context.Context, provider user.OAuthProvider, userInfo *user.OAuthUserInfo) (*user.User, *TokenPair, error) {
	// Try to find existing user by OAuth account
	existingUser, err := s.userRepo.GetUserByOAuthAccount(ctx, provider, userInfo.ProviderID)
	if err == nil {
		// User found with OAuth account - update last login and generate tokens
		if updateErr := s.userRepo.UpdateLastLogin(ctx, existingUser.ID); updateErr != nil {
			// Log but don't fail
		}

		tokens, tokenErr := s.generateTokenPair(existingUser)
		if tokenErr != nil {
			return nil, nil, tokenErr
		}

		// Update user info if changed
		updated := false
		if userInfo.Name != "" && existingUser.Name != userInfo.Name {
			existingUser.Name = userInfo.Name
			updated = true
		}
		if userInfo.Avatar != "" && existingUser.Avatar != userInfo.Avatar {
			existingUser.Avatar = userInfo.Avatar
			updated = true
		}
		if updated {
			if updateErr := s.userRepo.Update(ctx, existingUser); updateErr != nil {
				// Log but don't fail
			}
		}

		return existingUser, tokens, nil
	}

	// Not found by OAuth account - try to find by email
	if userInfo.Email != "" {
		existingUser, err = s.userRepo.GetByEmail(ctx, userInfo.Email)
		if err == nil {
			// User exists with same email - link OAuth account
			oauthAccount := &user.OAuthAccount{
				UserID:     existingUser.ID,
				Provider:   provider,
				ProviderID: userInfo.ProviderID,
				Email:      userInfo.Email,
				Name:       userInfo.Name,
				Avatar:     userInfo.Avatar,
			}
			if linkErr := s.userRepo.CreateOAuthAccount(ctx, oauthAccount); linkErr != nil {
				return nil, nil, linkErr
			}

			// Update last login
			if updateErr := s.userRepo.UpdateLastLogin(ctx, existingUser.ID); updateErr != nil {
				// Log but don't fail
			}

			tokens, tokenErr := s.generateTokenPair(existingUser)
			if tokenErr != nil {
				return nil, nil, tokenErr
			}

			return existingUser, tokens, nil
		}
	}

	// Create new user from OAuth info
	// Generate a random password since user will login via OAuth
	randomPassword := uuid.New().String() + uuid.New().String()

	newUser := &user.User{
		Email:    userInfo.Email,
		Name:     userInfo.Name,
		Role:     user.RoleUser,
		Avatar:   userInfo.Avatar,
		IsActive: true,
	}

	if err := newUser.SetPassword(randomPassword); err != nil {
		return nil, nil, apperrors.NewInternalError(err)
	}

	if err := s.userRepo.Create(ctx, newUser); err != nil {
		return nil, nil, err
	}

	// Create OAuth account link
	oauthAccount := &user.OAuthAccount{
		UserID:     newUser.ID,
		Provider:   provider,
		ProviderID: userInfo.ProviderID,
		Email:      userInfo.Email,
		Name:       userInfo.Name,
		Avatar:     userInfo.Avatar,
	}

	if err := s.userRepo.CreateOAuthAccount(ctx, oauthAccount); err != nil {
		// Log error but don't fail - user is already created
	}

	// Generate tokens
	tokens, err := s.generateTokenPair(newUser)
	if err != nil {
		return nil, nil, err
	}

	return newUser, tokens, nil
}

// LinkOAuthAccount links an OAuth account to an existing user
func (s *authService) LinkOAuthAccount(ctx context.Context, userID uuid.UUID, provider user.OAuthProvider, userInfo *user.OAuthUserInfo) error {
	// Check if OAuth account already exists
	_, err := s.userRepo.GetOAuthAccount(ctx, provider, userInfo.ProviderID)
	if err == nil {
		return apperrors.NewConflictError("oauth account already linked to another user")
	}
	if !apperrors.IsNotFound(err) {
		return err
	}

	// Create OAuth account link
	oauthAccount := &user.OAuthAccount{
		UserID:     userID,
		Provider:   provider,
		ProviderID: userInfo.ProviderID,
		Email:      userInfo.Email,
		Name:       userInfo.Name,
		Avatar:     userInfo.Avatar,
	}

	return s.userRepo.CreateOAuthAccount(ctx, oauthAccount)
}

// UnlinkOAuthAccount removes an OAuth account link
func (s *authService) UnlinkOAuthAccount(ctx context.Context, userID uuid.UUID, accountID uuid.UUID) error {
	// Get user's OAuth accounts
	accounts, err := s.userRepo.GetUserOAuthAccounts(ctx, userID)
	if err != nil {
		return err
	}

	// Find the account to unlink
	var found bool
	for _, acc := range accounts {
		if acc.ID == accountID {
			found = true
			break
		}
	}

	if !found {
		return apperrors.NewNotFoundError("oauth account")
	}

	// Check if user has a password set (not a pure OAuth user)
	u, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return err
	}

	// Count remaining OAuth accounts
	oauthCount := len(accounts)
	// Check if user has password by verifying a dummy password (will fail if no password)
	hasPassword := u.Password != "" && !u.CheckPassword("")

	if oauthCount <= 1 && !hasPassword {
		return apperrors.NewBadRequestError("cannot unlink last OAuth account without a password set")
	}

	return s.userRepo.DeleteOAuthAccount(ctx, accountID)
}

// GetUserOAuthAccounts gets all OAuth accounts for a user
func (s *authService) GetUserOAuthAccounts(ctx context.Context, userID uuid.UUID) ([]user.OAuthAccount, error) {
	return s.userRepo.GetUserOAuthAccounts(ctx, userID)
}

func (s *authService) generateTokenPair(u *user.User) (*TokenPair, error) {
	now := time.Now()

	// Access token
	accessClaims := Claims{
		UserID: u.ID,
		Email:  u.Email,
		Role:   u.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Duration(s.jwtCfg.AccessTokenTTL) * time.Second)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Subject:   u.ID.String(),
		},
	}

	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
	accessTokenString, err := accessToken.SignedString([]byte(s.jwtCfg.Secret))
	if err != nil {
		return nil, apperrors.NewInternalError(err)
	}

	// Refresh token
	refreshClaims := jwt.RegisteredClaims{
		ExpiresAt: jwt.NewNumericDate(now.Add(time.Duration(s.jwtCfg.RefreshTokenTTL) * time.Second)),
		IssuedAt:  jwt.NewNumericDate(now),
		Subject:   u.ID.String(),
		ID:        uuid.New().String(),
	}

	refreshToken := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims)
	refreshTokenString, err := refreshToken.SignedString([]byte(s.jwtCfg.Secret))
	if err != nil {
		return nil, apperrors.NewInternalError(err)
	}

	return &TokenPair{
		AccessToken:  accessTokenString,
		RefreshToken: refreshTokenString,
		ExpiresAt:    now.Add(time.Duration(s.jwtCfg.AccessTokenTTL) * time.Second),
	}, nil
}

func (s *authService) parseToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(s.jwtCfg.Secret), nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, fmt.Errorf("invalid token claims")
}
