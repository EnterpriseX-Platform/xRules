import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { ApiResponse, PaginatedResponse } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('token');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.get<ApiResponse<T>>(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.post<ApiResponse<T>>(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.put<ApiResponse<T>>(url, data, config);
    return response.data;
  }

  async patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.patch<ApiResponse<T>>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.delete<ApiResponse<T>>(url, config);
    return response.data;
  }
}

export const api = new ApiClient();

// Workspace API
export const workspaceApi = {
  list: () => api.get('/workspaces'),
  get: (id: string) => api.get(`/workspaces/${id}`),
  create: (data: unknown) => api.post('/workspaces', data),
  update: (id: string, data: unknown) => api.put(`/workspaces/${id}`, data),
  delete: (id: string) => api.delete(`/workspaces/${id}`),
};

// Project API
export const projectApi = {
  list: (workspaceId: string) => api.get(`/workspaces/${workspaceId}/projects`),
  get: (workspaceId: string, id: string) => api.get(`/workspaces/${workspaceId}/projects/${id}`),
  create: (workspaceId: string, data: unknown) => api.post(`/workspaces/${workspaceId}/projects`, data),
  update: (workspaceId: string, id: string, data: unknown) => api.put(`/workspaces/${workspaceId}/projects/${id}`, data),
  delete: (workspaceId: string, id: string) => api.delete(`/workspaces/${workspaceId}/projects/${id}`),
};

// Rule API
export const ruleApi = {
  list: (workspaceId: string, projectId: string) => api.get(`/workspaces/${workspaceId}/projects/${projectId}/rules`),
  get: (workspaceId: string, projectId: string, id: string) => api.get(`/workspaces/${workspaceId}/projects/${projectId}/rules/${id}`),
  create: (workspaceId: string, projectId: string, data: unknown) => api.post(`/workspaces/${workspaceId}/projects/${projectId}/rules`, data),
  update: (workspaceId: string, projectId: string, id: string, data: unknown) => api.put(`/workspaces/${workspaceId}/projects/${projectId}/rules/${id}`, data),
  delete: (workspaceId: string, projectId: string, id: string) => api.delete(`/workspaces/${workspaceId}/projects/${projectId}/rules/${id}`),
  execute: (workspaceId: string, projectId: string, id: string, input?: unknown) => api.post(`/workspaces/${workspaceId}/projects/${projectId}/rules/${id}/execute`, { input }),
};

// Connection API
export const connectionApi = {
  list: (workspaceId: string) => api.get(`/workspaces/${workspaceId}/connections`),
  get: (workspaceId: string, id: string) => api.get(`/workspaces/${workspaceId}/connections/${id}`),
  create: (workspaceId: string, data: unknown) => api.post(`/workspaces/${workspaceId}/connections`, data),
  update: (workspaceId: string, id: string, data: unknown) => api.put(`/workspaces/${workspaceId}/connections/${id}`, data),
  delete: (workspaceId: string, id: string) => api.delete(`/workspaces/${workspaceId}/connections/${id}`),
  test: (workspaceId: string, id: string) => api.post(`/workspaces/${workspaceId}/connections/${id}/test`),
};

// Execution API
export const executionApi = {
  list: (ruleId: string) => api.get(`/rules/${ruleId}/executions`),
  get: (executionId: string) => api.get(`/executions/${executionId}`),
  getLogs: (executionId: string) => api.get(`/executions/${executionId}/logs`),
  cancel: (executionId: string) => api.post(`/executions/${executionId}/cancel`),
};
