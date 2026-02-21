'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, LoginCredentials, RegisterData, AuthTokens, OAuthProvider, OAuthAccount } from '@/types';
import { api, oauthApi, handleApiError } from '@/lib/api-client';
import { setTokens, setUser, clearTokens } from '@/lib/auth';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  oauthLoading: boolean;
  oauthError: string | null;
  linkedAccounts: OAuthAccount[];

  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
  clearError: () => void;

  // OAuth actions
  initiateOAuthLogin: (provider: OAuthProvider) => Promise<void>;
  handleOAuthCallback: (provider: OAuthProvider, code: string, state: string) => Promise<void>;
  getOAuthProviders: () => Promise<Array<{ id: string; name: string; display_name: string }>>;
  fetchLinkedAccounts: () => Promise<void>;
  unlinkOAuthAccount: (accountId: string) => Promise<void>;
  clearOAuthError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      oauthLoading: false,
      oauthError: null,
      linkedAccounts: [],

      login: async (credentials) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.post<{ data: { user: User; tokens: AuthTokens } }>(
            '/auth/login',
            credentials
          );
          
          const { user, tokens } = response.data;
          
          setTokens(tokens.accessToken, tokens.refreshToken);
          setUser(user);
          
          set({ user, isAuthenticated: true, isLoading: false });
        } catch (error) {
          set({
            error: handleApiError(error),
            isLoading: false,
            isAuthenticated: false,
          });
          throw error;
        }
      },

      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.post<{ data: { user: User; tokens: AuthTokens } }>(
            '/auth/register',
            data
          );
          
          const { user, tokens } = response.data;
          
          setTokens(tokens.accessToken, tokens.refreshToken);
          setUser(user);
          
          set({ user, isAuthenticated: true, isLoading: false });
        } catch (error) {
          set({
            error: handleApiError(error),
            isLoading: false,
            isAuthenticated: false,
          });
          throw error;
        }
      },

      logout: () => {
        clearTokens();
        set({ user: null, isAuthenticated: false, error: null, linkedAccounts: [] });
      },

      setUser: (user) => {
        setUser(user);
        set({ user, isAuthenticated: true });
      },

      clearError: () => set({ error: null }),

      // OAuth Actions
      initiateOAuthLogin: async (provider) => {
        set({ oauthLoading: true, oauthError: null });
        try {
          const response = await oauthApi.getOAuthUrl(provider);
          const { auth_url, state } = response;

          // Store state in localStorage for validation on callback
          if (typeof window !== 'undefined') {
            localStorage.setItem('oauth_state', state);
            localStorage.setItem('oauth_provider', provider);
          }

          // Redirect to OAuth provider
          window.location.href = auth_url;
        } catch (error) {
          set({
            oauthError: handleApiError(error),
            oauthLoading: false,
          });
          throw error;
        }
      },

      handleOAuthCallback: async (provider, code, state) => {
        set({ oauthLoading: true, oauthError: null });
        try {
          // Validate state to prevent CSRF
          const storedState = typeof window !== 'undefined' ? localStorage.getItem('oauth_state') : null;
          const storedProvider = typeof window !== 'undefined' ? localStorage.getItem('oauth_provider') : null;

          if (!storedState || storedState !== state) {
            throw new Error('Invalid OAuth state');
          }

          if (storedProvider !== provider) {
            throw new Error('OAuth provider mismatch');
          }

          // Clear stored state
          if (typeof window !== 'undefined') {
            localStorage.removeItem('oauth_state');
            localStorage.removeItem('oauth_provider');
          }

          const response = await oauthApi.handleCallback(provider, code, state);
          
          const { user, access_token, refresh_token } = response;
          
          setTokens(access_token, refresh_token);
          setUser(user);
          
          set({ 
            user, 
            isAuthenticated: true, 
            oauthLoading: false 
          });
        } catch (error) {
          set({
            oauthError: handleApiError(error),
            oauthLoading: false,
            isAuthenticated: false,
          });
          throw error;
        }
      },

      getOAuthProviders: async () => {
        try {
          const response = await oauthApi.getProviders();
          return response.providers;
        } catch (error) {
          console.error('Failed to fetch OAuth providers:', error);
          return [];
        }
      },

      fetchLinkedAccounts: async () => {
        try {
          const response = await oauthApi.getMyAccounts();
          set({ linkedAccounts: response.accounts });
        } catch (error) {
          console.error('Failed to fetch linked accounts:', error);
        }
      },

      unlinkOAuthAccount: async (accountId) => {
        try {
          await oauthApi.unlinkAccount(accountId);
          // Refresh linked accounts
          await get().fetchLinkedAccounts();
        } catch (error) {
          console.error('Failed to unlink account:', error);
          throw error;
        }
      },

      clearOAuthError: () => set({ oauthError: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ 
        user: state.user, 
        isAuthenticated: state.isAuthenticated 
      }),
    }
  )
);
