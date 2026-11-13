// Thin fetch wrapper around the xrules-backend Studio API.
// All paths are relative to NEXT_PUBLIC_API_URL.

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function token(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('xrules_token');
}

/** Active tenant slug — sent on every request as X-Tenant. */
export function activeTenant(): string | null {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem('xrules-auth') || '{}')?.state?.workspace?.slug || null; } catch { return null; }
}

function refreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  // The persisted zustand auth store keeps refresh_token alongside the
  // access token. Read from there because it survives reloads.
  try {
    const auth = JSON.parse(localStorage.getItem('xrules-auth') || '{}');
    return auth?.state?.refreshToken || localStorage.getItem('xrules_refresh_token');
  } catch {
    return localStorage.getItem('xrules_refresh_token');
  }
}

// Single in-flight refresh promise so concurrent 401s share one refresh.
let refreshing: Promise<string | null> | null = null;
async function tryRefresh(): Promise<string | null> {
  if (refreshing) return refreshing;
  const rt = refreshToken();
  if (!rt) return null;
  refreshing = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const newAccess = json?.data?.access_token;
      const newRefresh = json?.data?.refresh_token;
      if (newAccess) {
        localStorage.setItem('xrules_token', newAccess);
        // also write into zustand persist payload so the next load picks it up
        try {
          const auth = JSON.parse(localStorage.getItem('xrules-auth') || '{}');
          auth.state = auth.state || {};
          auth.state.token = newAccess;
          if (newRefresh) auth.state.refreshToken = newRefresh;
          localStorage.setItem('xrules-auth', JSON.stringify(auth));
        } catch {}
        if (newRefresh) localStorage.setItem('xrules_refresh_token', newRefresh);
        return newAccess;
      }
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function request<T>(path: string, init?: RequestInit, _retried = false): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  const t = token();
  if (t) headers['Authorization'] = `Bearer ${t}`;
  const tenant = activeTenant();
  if (tenant && !headers['X-Tenant']) headers['X-Tenant'] = tenant;

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  // 401 — try a single refresh + retry. If refresh fails, redirect to /login.
  if (res.status === 401 && !_retried && !path.startsWith('/auth/')) {
    const fresh = await tryRefresh();
    if (fresh) return request<T>(path, init, true);
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
    }
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const err = json.error || {};
    throw new ApiError(err.message || res.statusText, res.status, err.code);
  }
  return json.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: any) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: any) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: any) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// Resource clients
export const tenantApi = {
  list: () => api.get<any[]>('/workspaces'),
  create: (body: { name: string; description?: string }) => api.post<any>('/workspaces', body),
  current: () => api.get<any>('/tenant'),
  update: (body: any) => api.put<any>('/tenant', body),
  members: () => api.get<any[]>('/tenant/members'),
  addMember: (body: { email: string; role: string }) => api.post<any>('/tenant/members', body),
  setRole: (userId: string, role: string) => api.put<any>(`/tenant/members/${userId}`, { role }),
  removeMember: (userId: string) => api.del<any>(`/tenant/members/${userId}`),
};
export const projectAccessApi = {
  members: (projectId: string) => api.get<any[]>(`/projects/${projectId}/members`),
  setRole: (projectId: string, userId: string, role: string | null) => api.put<any>(`/projects/${projectId}/members/${userId}`, { role }),
};

export const projectsApi = {
  list: () => api.get<any[]>('/projects'),
  get: (id: string) => api.get<any>(`/projects/${id}`),
  create: (body: any) => api.post<any>('/projects', body),
  update: (id: string, body: any) => api.put<any>(`/projects/${id}`, body),
  remove: (id: string) => api.del<void>(`/projects/${id}`),
};

export const rulesApi = {
  list: (projectId: string, status?: string) =>
    api.get<any[]>(`/rules?project_id=${projectId}${status ? `&status=${status}` : ''}`),
  get: (id: string) => api.get<any>(`/rules/${id}`),
  create: (body: any) => api.post<any>('/rules', body),
  update: (id: string, body: any) => api.put<any>(`/rules/${id}`, body),
  remove: (id: string) => api.del<void>(`/rules/${id}`),
  publish: (id: string) => api.post<any>(`/rules/${id}/publish`),
  versions: (id: string) => api.get<any[]>(`/rules/${id}/versions`),
  testCases: (id: string) => api.get<any[]>(`/rules/${id}/test-cases`),
  createTestCase: (id: string, body: any) => api.post<any>(`/rules/${id}/test-cases`, body),
  openapi: (id: string) => api.get<any>(`/api/v1/rules/${id}/openapi.json`),
};

export const flowsApi = {
  list: (projectId: string) => api.get<any[]>(`/flows?project_id=${projectId}`),
  get: (id: string) => api.get<any>(`/flows/${id}`),
  create: (body: any) => api.post<any>('/flows', body),
  update: (id: string, body: any) => api.put<any>(`/flows/${id}`, body),
  remove: (id: string) => api.del<void>(`/flows/${id}`),
};

export const testSuitesApi = {
  list: (projectId: string) => api.get<any[]>(`/test-suites?project_id=${projectId}`),
  get: (id: string) => api.get<any>(`/test-suites/${id}`),
  create: (body: any) => api.post<any>('/test-suites', body),
  run: (id: string, datasetId?: string) => api.post<any>(`/test-suites/${id}/run`, { datasetId }),
};

export const datasetsApi = {
  list: (projectId: string) => api.get<any[]>(`/datasets?project_id=${projectId}`),
  create: (body: any) => api.post<any>('/datasets', body),
};

export const scenariosApi = {
  list: (projectId: string) => api.get<any[]>(`/scenarios?project_id=${projectId}`),
  create: (body: any) => api.post<any>('/scenarios', body),
};

export const simulationsApi = {
  list: (projectId: string) => api.get<any[]>(`/simulations?project_id=${projectId}`),
  get: (id: string) => api.get<any>(`/simulations/${id}`),
  diff: (body: any) => api.post<any>('/simulations/diff', body),
  replay: (body: any) => api.post<any>('/simulations/replay', body),
  sweep: (body: any) => api.post<any>('/simulations/sweep', body),
};

export const releasesApi = {
  list: (projectId: string) => api.get<any[]>(`/releases?project_id=${projectId}`),
  create: (body: any) => api.post<any>('/releases', body),
};

export const environmentsApi = {
  list: (projectId: string) => api.get<any[]>(`/environments?project_id=${projectId}`),
  create: (body: any) => api.post<any>('/environments', body),
  pin: (id: string, releaseId: string) => api.post<any>(`/environments/${id}/pin`, { releaseId }),
};

export const connectionsApi = {
  list: (projectId: string) => api.get<any[]>(`/connections?project_id=${projectId}`),
  create: (body: any) => api.post<any>('/connections', body),
};

export const apiKeysApi = {
  list: (workspaceSlug: string) => api.get<any[]>(`/api-keys?workspace=${workspaceSlug}`),
  create: (body: any) => api.post<any>('/api-keys', body),
  remove: (id: string) => api.del<void>(`/api-keys/${id}`),
};

export const dashboardApi = {
  get: (workspaceSlug: string) =>
    api.get<any>(`/dashboard${workspaceSlug ? `?workspace=${workspaceSlug}` : ''}`),
};

export const authApi = {
  login: (email: string, password: string) => api.post<any>('/auth/login', { email, password }),
  signup: (body: any) => api.post<any>('/auth/signup', body),
  me: () => api.get<any>('/auth/me'),
};

export const executionsApi = {
  list: (filters: { ruleId?: string; environment?: string; limit?: number }) => {
    const qs = new URLSearchParams(filters as any).toString();
    return api.get<any[]>(`/executions?${qs}`);
  },
};

export const executeApi = {
  // Test execute (auth-bearing route, not public solver).
  // Backend expects { rule_id, input, context } at POST /execute.
  run: (ruleId: string, input: any, context: any = {}) =>
    api.post<any>(`/execute`, { rule_id: ruleId, input, context }),
};
