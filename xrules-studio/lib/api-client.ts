import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { User } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api/go';

// Create axios instance
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Get token from localStorage
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        
        if (refreshToken) {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refreshToken,
          });

          const { accessToken, refreshToken: newRefreshToken } = response.data.data;

          localStorage.setItem('accessToken', accessToken);
          localStorage.setItem('refreshToken', newRefreshToken);

          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          }

          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, logout user
        if (typeof window !== 'undefined') {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
      }
    }

    return Promise.reject(error);
  }
);

// API helper functions
export const api = {
  get: <T>(url: string, params?: Record<string, unknown>) =>
    apiClient.get<T>(url, { params }).then((res) => res.data),

  post: <T>(url: string, data?: unknown) =>
    apiClient.post<T>(url, data).then((res) => res.data),

  put: <T>(url: string, data?: unknown) =>
    apiClient.put<T>(url, data).then((res) => res.data),

  patch: <T>(url: string, data?: unknown) =>
    apiClient.patch<T>(url, data).then((res) => res.data),

  delete: <T>(url: string) =>
    apiClient.delete<T>(url).then((res) => res.data),
};

// OAuth API endpoints
export const oauthApi = {
  getProviders: () =>
    api.get<{ providers: Array<{ id: string; name: string; display_name: string }> }>('/auth/oauth/providers'),

  getOAuthUrl: (provider: string, redirectUri?: string) =>
    api.get<{ auth_url: string; state: string }>(`/auth/oauth/${provider}/login`, redirectUri ? { redirect_uri: redirectUri } : undefined),

  handleCallback: (provider: string, code: string, state: string) =>
    api.post<{ user: User; access_token: string; refresh_token: string; expires_at: string }>(`/auth/oauth/${provider}/callback`, null, {
      params: { code, state },
    }),

  getMyAccounts: () =>
    api.get<{ accounts: Array<{ id: string; provider: string; email: string; name: string; created_at: string }> }>('/auth/oauth/accounts'),

  linkAccount: (provider: string, code: string, state: string) =>
    api.post('/auth/oauth/link', { provider, code, state }),

  unlinkAccount: (accountId: string) =>
    api.delete(`/auth/oauth/accounts/${accountId}`),
};

// Error handler
export function handleApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: string; message?: string }>;
    return (
      axiosError.response?.data?.error ||
      axiosError.response?.data?.message ||
      axiosError.message ||
      'An error occurred'
    );
  }
  return 'An unexpected error occurred';
}
