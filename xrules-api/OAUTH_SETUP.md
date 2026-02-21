# OAuth/SSO Setup Guide

This document describes how to configure OAuth and SSO authentication for xrules-api.

## Supported Providers

- **Google** - Google OAuth 2.0
- **GitHub** - GitHub OAuth 2.0
- **Microsoft/Azure AD** - Microsoft Identity Platform
- **OIDC** - Generic OpenID Connect (for custom identity providers)

## Configuration

OAuth configuration is done via the `config.yaml` file or environment variables.

### Environment Variables

You can also configure OAuth using environment variables with the `XRULES_` prefix:

```bash
# Google OAuth
export XRULES_OAUTH_GOOGLE_ENABLED=true
export XRULES_OAUTH_GOOGLE_CLIENT_ID=your-google-client-id
export XRULES_OAUTH_GOOGLE_CLIENT_SECRET=your-google-client-secret

# GitHub OAuth
export XRULES_OAUTH_GITHUB_ENABLED=true
export XRULES_OAUTH_GITHUB_CLIENT_ID=your-github-client-id
export XRULES_OAUTH_GITHUB_CLIENT_SECRET=your-github-client-secret

# Microsoft OAuth
export XRULES_OAUTH_MICROSOFT_ENABLED=true
export XRULES_OAUTH_MICROSOFT_CLIENT_ID=your-microsoft-client-id
export XRULES_OAUTH_MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
export XRULES_OAUTH_MICROSOFT_TENANT=common

# OIDC
export XRULES_OAUTH_OIDC_ENABLED=true
export XRULES_OAUTH_OIDC_ISSUER_URL=https://your-identity-provider.com
export XRULES_OAUTH_OIDC_CLIENT_ID=your-client-id
export XRULES_OAUTH_OIDC_CLIENT_SECRET=your-client-secret
```

## Setting Up OAuth Providers

### Google OAuth

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "OAuth client ID"
5. Select "Web application" as the application type
6. Add authorized redirect URIs:
   - `http://localhost:8080/auth/oauth/google/callback` (development)
   - `https://your-domain.com/auth/oauth/google/callback` (production)
7. Copy the Client ID and Client Secret to your configuration

### GitHub OAuth

1. Go to your GitHub account settings
2. Navigate to "Developer settings" > "OAuth Apps"
3. Click "New OAuth App"
4. Fill in the application details
5. Set the Authorization callback URL:
   - `http://localhost:8080/auth/oauth/github/callback` (development)
   - `https://your-domain.com/auth/oauth/github/callback` (production)
6. Copy the Client ID and Client Secret to your configuration

### Microsoft/Azure AD OAuth

1. Go to the [Azure Portal](https://portal.azure.com/)
2. Navigate to "Azure Active Directory" > "App registrations"
3. Click "New registration"
4. Fill in the application details
5. Set the redirect URI:
   - Platform: Web
   - URL: `http://localhost:8080/auth/oauth/microsoft/callback` (development)
6. Copy the Application (client) ID
7. Go to "Certificates & secrets" and create a new client secret
8. Copy the client secret value to your configuration

#### Tenant Configuration

- Use `common` to allow users from any Azure AD tenant
- Use `organizations` to allow only work/school accounts
- Use a specific tenant ID to restrict to a single organization
- Use `consumers` to allow only personal Microsoft accounts

### Generic OIDC

For other identity providers that support OpenID Connect:

1. Configure your identity provider with the redirect URI:
   - `http://localhost:8080/auth/oauth/oidc/callback`
2. Obtain the Issuer URL (usually provided by your IdP)
3. Copy the Client ID and Client Secret to your configuration

## Database Migration

When enabling OAuth for the first time, ensure the database has the required tables. The `OAuthAccount` model is linked to the `User` model with a foreign key.

Run database migrations to create the necessary tables:

```bash
cd xrules-api
# Using golang-migrate
migrate -path migrations -database "postgresql://user:pass@localhost/xrules?sslmode=disable" up
```

## API Endpoints

### OAuth Endpoints

- `GET /api/auth/oauth/providers` - List enabled OAuth providers
- `GET /api/auth/oauth/:provider/login` - Initiate OAuth login flow
- `GET /api/auth/oauth/:provider/callback` - OAuth callback (handled by backend)

### Protected OAuth Endpoints (requires authentication)

- `GET /api/auth/oauth/accounts` - List user's linked OAuth accounts
- `POST /api/auth/oauth/link` - Link an OAuth account to current user
- `DELETE /api/auth/oauth/accounts/:accountID` - Unlink an OAuth account

## Frontend Integration

The frontend should:

1. Call `GET /api/auth/oauth/:provider/login` to get the OAuth URL
2. Redirect the user to the OAuth provider
3. Handle the callback (the backend handles the actual callback processing)
4. Store the received tokens

## Security Considerations

1. **State Parameter**: The implementation uses a state parameter to prevent CSRF attacks
2. **State Storage**: OAuth state is stored in Redis with a 10-minute expiration
3. **PKCE**: Consider implementing PKCE (Proof Key for Code Exchange) for enhanced security
4. **HTTPS**: Always use HTTPS in production for OAuth redirects
5. **Client Secrets**: Never expose client secrets in frontend code

## Troubleshooting

### State validation fails

- Check that Redis is running and accessible
- Ensure the state parameter is being passed correctly
- Check that the state hasn't expired (10-minute limit)

### User not created

- Ensure the OAuth provider returns an email address
- Check that the email is verified by the provider
- Review server logs for detailed error messages

### Token exchange fails

- Verify client ID and client secret are correct
- Check that the redirect URL matches exactly what's configured in the provider
- Ensure the provider is enabled in the configuration
