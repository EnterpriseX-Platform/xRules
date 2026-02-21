package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"xrules-api/internal/config"
	"xrules-api/internal/domain/user"
	"xrules-api/internal/infra/cache"
	apperrors "xrules-api/pkg/errors"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

// OAuthService handles OAuth provider operations
type OAuthService interface {
	GetAuthURL(provider user.OAuthProvider, redirectURI string) (string, string, error)
	ExchangeCode(ctx context.Context, provider user.OAuthProvider, code, state, redirectURI string) (*user.OAuthUserInfo, error)
	ValidateState(ctx context.Context, state string) (bool, error)
	GetSupportedProviders() []user.OAuthProvider
	IsProviderEnabled(provider user.OAuthProvider) bool
}

// oauthService implements OAuthService
type oauthService struct {
	cache      *cache.Cache
	cfg        config.OAuthConfig
	oauthConfs map[user.OAuthProvider]*oauth2.Config
	oidcProvider *oidc.Provider
}

// NewOAuthService creates a new OAuth service
func NewOAuthService(cache *cache.Cache, cfg config.OAuthConfig) (OAuthService, error) {
	service := &oauthService{
		cache:      cache,
		cfg:        cfg,
		oauthConfs: make(map[user.OAuthProvider]*oauth2.Config),
	}

	// Configure Google OAuth
	if cfg.Google.Enabled {
		service.oauthConfs[user.OAuthProviderGoogle] = &oauth2.Config{
			ClientID:     cfg.Google.ClientID,
			ClientSecret: cfg.Google.ClientSecret,
			RedirectURL:  cfg.Google.RedirectURL,
			Scopes:       []string{"openid", "email", "profile"},
			Endpoint: oauth2.Endpoint{
				AuthURL:  "https://accounts.google.com/o/oauth2/auth",
				TokenURL: "https://oauth2.googleapis.com/token",
			},
		}
	}

	// Configure GitHub OAuth
	if cfg.GitHub.Enabled {
		service.oauthConfs[user.OAuthProviderGitHub] = &oauth2.Config{
			ClientID:     cfg.GitHub.ClientID,
			ClientSecret: cfg.GitHub.ClientSecret,
			RedirectURL:  cfg.GitHub.RedirectURL,
			Scopes:       []string{"user:email", "read:user"},
			Endpoint: oauth2.Endpoint{
				AuthURL:  "https://github.com/login/oauth/authorize",
				TokenURL: "https://github.com/login/oauth/access_token",
			},
		}
	}

	// Configure Microsoft OAuth
	if cfg.Microsoft.Enabled {
		tenant := cfg.Microsoft.Tenant
		if tenant == "" {
			tenant = "common"
		}
		service.oauthConfs[user.OAuthProviderMicrosoft] = &oauth2.Config{
			ClientID:     cfg.Microsoft.ClientID,
			ClientSecret: cfg.Microsoft.ClientSecret,
			RedirectURL:  cfg.Microsoft.RedirectURL,
			Scopes:       []string{"openid", "email", "profile", "User.Read"},
			Endpoint: oauth2.Endpoint{
				AuthURL:  fmt.Sprintf("https://login.microsoftonline.com/%s/oauth2/v2.0/authorize", tenant),
				TokenURL: fmt.Sprintf("https://login.microsoftonline.com/%s/oauth2/v2.0/token", tenant),
			},
		}
	}

	// Configure OIDC
	if cfg.OIDC.Enabled {
		provider, err := oidc.NewProvider(context.Background(), cfg.OIDC.IssuerURL)
		if err != nil {
			return nil, fmt.Errorf("failed to create OIDC provider: %w", err)
		}
		service.oidcProvider = provider

		scopes := cfg.OIDC.Scopes
		if len(scopes) == 0 {
			scopes = []string{oidc.ScopeOpenID, "profile", "email"}
		}

		service.oauthConfs[user.OAuthProviderOIDC] = &oauth2.Config{
			ClientID:     cfg.OIDC.ClientID,
			ClientSecret: cfg.OIDC.ClientSecret,
			RedirectURL:  cfg.OIDC.RedirectURL,
			Scopes:       scopes,
			Endpoint:     provider.Endpoint(),
		}
	}

	return service, nil
}

// GetAuthURL generates an OAuth authorization URL
func (s *oauthService) GetAuthURL(provider user.OAuthProvider, redirectURI string) (string, string, error) {
	config, ok := s.oauthConfs[provider]
	if !ok {
		return "", "", apperrors.NewBadRequestError(fmt.Sprintf("unsupported OAuth provider: %s", provider))
	}

	// Generate random state
	state, err := generateRandomState()
	if err != nil {
		return "", "", apperrors.NewInternalError(err)
	}

	// Store state in cache with 10-minute expiration
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	stateKey := fmt.Sprintf("oauth:state:%s", state)
	if err := s.cache.Set(ctx, stateKey, redirectURI, 10*time.Minute); err != nil {
		return "", "", apperrors.NewInternalError(err)
	}

	// Generate auth URL
	authURL := config.AuthCodeURL(state, oauth2.AccessTypeOnline)

	return authURL, state, nil
}

// ExchangeCode exchanges an authorization code for user info
func (s *oauthService) ExchangeCode(ctx context.Context, provider user.OAuthProvider, code, state, redirectURI string) (*user.OAuthUserInfo, error) {
	// Validate state
	valid, err := s.ValidateState(ctx, state)
	if err != nil {
		return nil, err
	}
	if !valid {
		return nil, apperrors.NewUnauthorizedError("invalid or expired state")
	}

	// Delete used state
	stateKey := fmt.Sprintf("oauth:state:%s", state)
	s.cache.Delete(ctx, stateKey)

	config, ok := s.oauthConfs[provider]
	if !ok {
		return nil, apperrors.NewBadRequestError(fmt.Sprintf("unsupported OAuth provider: %s", provider))
	}

	// Exchange code for token
	token, err := config.Exchange(ctx, code)
	if err != nil {
		return nil, apperrors.NewExternalServiceError(string(provider), err)
	}

	// Fetch user info based on provider
	switch provider {
	case user.OAuthProviderGoogle:
		return s.fetchGoogleUserInfo(ctx, token)
	case user.OAuthProviderGitHub:
		return s.fetchGitHubUserInfo(ctx, token)
	case user.OAuthProviderMicrosoft:
		return s.fetchMicrosoftUserInfo(ctx, token)
	case user.OAuthProviderOIDC:
		return s.fetchOIDCUserInfo(ctx, token)
	default:
		return nil, apperrors.NewBadRequestError(fmt.Sprintf("unsupported OAuth provider: %s", provider))
	}
}

// ValidateState validates the OAuth state parameter
func (s *oauthService) ValidateState(ctx context.Context, state string) (bool, error) {
	stateKey := fmt.Sprintf("oauth:state:%s", state)
	exists, err := s.cache.Exists(ctx, stateKey)
	if err != nil {
		return false, apperrors.NewInternalError(err)
	}
	return exists, nil
}

// GetSupportedProviders returns a list of enabled OAuth providers
func (s *oauthService) GetSupportedProviders() []user.OAuthProvider {
	providers := make([]user.OAuthProvider, 0)
	for provider := range s.oauthConfs {
		providers = append(providers, provider)
	}
	return providers
}

// IsProviderEnabled checks if a provider is enabled
func (s *oauthService) IsProviderEnabled(provider user.OAuthProvider) bool {
	_, ok := s.oauthConfs[provider]
	return ok
}

// fetchGoogleUserInfo fetches user info from Google
func (s *oauthService) fetchGoogleUserInfo(ctx context.Context, token *oauth2.Token) (*user.OAuthUserInfo, error) {
	client := oauth2.NewClient(ctx, oauth2.StaticTokenSource(token))
	resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		return nil, apperrors.NewExternalServiceError("google", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, apperrors.NewExternalServiceError("google", fmt.Errorf("failed to fetch user info: %s", string(body)))
	}

	var userInfo struct {
		ID      string `json:"id"`
		Email   string `json:"email"`
		Name    string `json:"name"`
		Picture string `json:"picture"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&userInfo); err != nil {
		return nil, apperrors.NewExternalServiceError("google", err)
	}

	return &user.OAuthUserInfo{
		ProviderID: userInfo.ID,
		Email:      userInfo.Email,
		Name:       userInfo.Name,
		Avatar:     userInfo.Picture,
	}, nil
}

// fetchGitHubUserInfo fetches user info from GitHub
func (s *oauthService) fetchGitHubUserInfo(ctx context.Context, token *oauth2.Token) (*user.OAuthUserInfo, error) {
	client := oauth2.NewClient(ctx, oauth2.StaticTokenSource(token))

	// Fetch user info
	resp, err := client.Get("https://api.github.com/user")
	if err != nil {
		return nil, apperrors.NewExternalServiceError("github", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, apperrors.NewExternalServiceError("github", fmt.Errorf("failed to fetch user info: %s", string(body)))
	}

	var userInfo struct {
		ID        int64  `json:"id"`
		Email     string `json:"email"`
		Name      string `json:"name"`
		Login     string `json:"login"`
		AvatarURL string `json:"avatar_url"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&userInfo); err != nil {
		return nil, apperrors.NewExternalServiceError("github", err)
	}

	// GitHub doesn't always return email in the user endpoint, fetch from emails endpoint
	email := userInfo.Email
	if email == "" {
		emailResp, err := client.Get("https://api.github.com/user/emails")
		if err == nil {
			defer emailResp.Body.Close()
			var emails []struct {
				Email    string `json:"email"`
				Primary  bool   `json:"primary"`
				Verified bool   `json:"verified"`
			}
			if err := json.NewDecoder(emailResp.Body).Decode(&emails); err == nil {
				for _, e := range emails {
					if e.Primary && e.Verified {
						email = e.Email
						break
					}
				}
			}
		}
	}

	// Use login as name if name is empty
	name := userInfo.Name
	if name == "" {
		name = userInfo.Login
	}

	return &user.OAuthUserInfo{
		ProviderID: fmt.Sprintf("%d", userInfo.ID),
		Email:      email,
		Name:       name,
		Avatar:     userInfo.AvatarURL,
	}, nil
}

// fetchMicrosoftUserInfo fetches user info from Microsoft
func (s *oauthService) fetchMicrosoftUserInfo(ctx context.Context, token *oauth2.Token) (*user.OAuthUserInfo, error) {
	client := oauth2.NewClient(ctx, oauth2.StaticTokenSource(token))
	resp, err := client.Get("https://graph.microsoft.com/v1.0/me")
	if err != nil {
		return nil, apperrors.NewExternalServiceError("microsoft", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, apperrors.NewExternalServiceError("microsoft", fmt.Errorf("failed to fetch user info: %s", string(body)))
	}

	var userInfo struct {
		ID                string `json:"id"`
		Mail              string `json:"mail"`
		UserPrincipalName string `json:"userPrincipalName"`
		DisplayName       string `json:"displayName"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&userInfo); err != nil {
		return nil, apperrors.NewExternalServiceError("microsoft", err)
	}

	// Use mail if available, otherwise use userPrincipalName
	email := userInfo.Mail
	if email == "" {
		email = userInfo.UserPrincipalName
	}

	return &user.OAuthUserInfo{
		ProviderID: userInfo.ID,
		Email:      email,
		Name:       userInfo.DisplayName,
		Avatar:     "", // Microsoft doesn't provide avatar URL directly
	}, nil
}

// fetchOIDCUserInfo fetches user info from OIDC provider
func (s *oauthService) fetchOIDCUserInfo(ctx context.Context, token *oauth2.Token) (*user.OAuthUserInfo, error) {
	if s.oidcProvider == nil {
		return nil, apperrors.NewInternalError(fmt.Errorf("OIDC provider not initialized"))
	}

	userInfo, err := s.oidcProvider.UserInfo(ctx, oauth2.StaticTokenSource(token))
	if err != nil {
		return nil, apperrors.NewExternalServiceError("oidc", err)
	}

	var claims struct {
		Subject string `json:"sub"`
		Email   string `json:"email"`
		Name    string `json:"name"`
		Picture string `json:"picture"`
	}

	if err := userInfo.Claims(&claims); err != nil {
		return nil, apperrors.NewExternalServiceError("oidc", err)
	}

	return &user.OAuthUserInfo{
		ProviderID: claims.Subject,
		Email:      claims.Email,
		Name:       claims.Name,
		Avatar:     claims.Picture,
	}, nil
}

// generateRandomState generates a random state string
func generateRandomState() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}
