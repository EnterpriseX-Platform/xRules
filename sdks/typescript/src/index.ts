// XRules TypeScript SDK
//
// Usage:
//   import { XRulesClient } from '@xrules/sdk';
//   const client = new XRulesClient({ baseUrl: 'http://localhost:4000', apiKey: '...' });
//   const result = await client.execute('rule-slug-or-id', { amount: 1000, country: 'US' });
//
// All requests use the public Solver API (`POST /api/v1/rules/:id/execute`),
// which authenticates via X-API-Key header. No JWT, no UI auth.

export interface XRulesClientOptions {
  /** Backend base URL — e.g. https://api.xrules.example */
  baseUrl: string;
  /** API key from Studio → Integrations → API Keys */
  apiKey: string;
  /** Per-call request timeout in ms (default 30s) */
  timeoutMs?: number;
  /** Custom fetch implementation (for testing or non-browser/Node18 envs) */
  fetch?: typeof fetch;
}

export interface ExecuteOptions {
  /** Pin a specific rule version (default = the rule's current published version) */
  version?: number;
  /** Environment slug — pins to the release that's pinned to this env */
  environment?: string;
  /** Solver headers — see docs */
  context?: Record<string, any>;
  /** AbortSignal to cancel the request mid-flight */
  signal?: AbortSignal;
}

export interface ExecuteResult<T = any> {
  id: string;
  ruleId: string;
  ruleVersion: number;
  output: T;
  duration: number;
  status: 'SUCCESS' | 'FAILED';
}

export class XRulesError extends Error {
  status?: number;
  code?: string;
  constructor(msg: string, status?: number, code?: string) {
    super(msg);
    this.name = 'XRulesError';
    this.status = status;
    this.code = code;
  }
}

export class XRulesClient {
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  constructor(opts: XRulesClientOptions) {
    if (!opts.baseUrl) throw new XRulesError('baseUrl is required');
    if (!opts.apiKey) throw new XRulesError('apiKey is required');
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchImpl = opts.fetch || fetch;
  }

  /** Execute a rule by id, slug, or alias. */
  async execute<T = any>(ruleIdSlugOrAlias: string, input: any, opts: ExecuteOptions = {}): Promise<ExecuteResult<T>> {
    const path = opts.version
      ? `/api/v1/rules/${encodeURIComponent(ruleIdSlugOrAlias)}/v/${opts.version}/execute`
      : `/api/v1/rules/${encodeURIComponent(ruleIdSlugOrAlias)}/execute`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
    };
    if (opts.environment) headers['X-Environment'] = opts.environment;
    if (opts.context) {
      for (const [k, v] of Object.entries(opts.context)) {
        headers[`X-Context-${k}`] = typeof v === 'string' ? v : JSON.stringify(v);
      }
    }

    return this.request<ExecuteResult<T>>(path, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
      signal: opts.signal,
    });
  }

  /** Fetch the auto-generated OpenAPI 3.1 spec for a rule. */
  async getOpenApi(ruleIdSlugOrAlias: string): Promise<any> {
    return this.request<any>(`/api/v1/rules/${encodeURIComponent(ruleIdSlugOrAlias)}/openapi.json`, {
      method: 'GET',
      headers: { 'X-API-Key': this.apiKey },
    });
  }

  /** Bulk-execute one rule against many inputs (server-side batch). */
  async batchExecute<T = any>(ruleIdSlugOrAlias: string, inputs: any[], opts: ExecuteOptions = {}): Promise<ExecuteResult<T>[]> {
    const path = `/api/v1/rules/${encodeURIComponent(ruleIdSlugOrAlias)}/batch-execute`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
    };
    if (opts.environment) headers['X-Environment'] = opts.environment;
    return this.request<ExecuteResult<T>[]>(path, {
      method: 'POST',
      headers,
      body: JSON.stringify({ inputs }),
      signal: opts.signal,
    });
  }

  private async request<T>(path: string, init: RequestInit & { headers: Record<string, string> }): Promise<T> {
    const ctrl = new AbortController();
    const tmr = setTimeout(() => ctrl.abort(), this.timeoutMs);
    const composedSignal = init.signal
      ? mergeSignals(init.signal, ctrl.signal)
      : ctrl.signal;
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, signal: composedSignal });
      const text = await res.text();
      let parsed: any;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
      if (!res.ok) {
        const err = parsed?.error || {};
        throw new XRulesError(err.message || res.statusText || 'Request failed', res.status, err.code);
      }
      // Backend wraps responses as { success: true, data: ... }
      if (parsed && typeof parsed === 'object' && 'success' in parsed && 'data' in parsed) {
        return parsed.data as T;
      }
      return parsed as T;
    } finally {
      clearTimeout(tmr);
    }
  }
}

function mergeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (typeof (AbortSignal as any).any === 'function') return (AbortSignal as any).any([a, b]);
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (a.aborted || b.aborted) ctrl.abort();
  else { a.addEventListener('abort', onAbort); b.addEventListener('abort', onAbort); }
  return ctrl.signal;
}
