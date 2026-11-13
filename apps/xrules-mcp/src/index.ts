#!/usr/bin/env node
// xRules MCP server. Environment:
//   XRULES_URL      backend base URL (default http://localhost:4000)
//   XRULES_TOKEN    a user access token, or XRULES_EMAIL + XRULES_PASSWORD to log in
//   XRULES_PROJECT  default project id or slug
// Every write creates DRAFTS only. Publishing stays behind tests and review in xRules.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE = (process.env.XRULES_URL || 'http://localhost:4000').replace(/\/$/, '');
let token = process.env.XRULES_TOKEN || '';
const PROJECT = process.env.XRULES_PROJECT || '';

async function api(method: string, path: string, body?: unknown): Promise<any> {
  if (!token && process.env.XRULES_EMAIL) {
    const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.XRULES_EMAIL, password: process.env.XRULES_PASSWORD }) });
    token = (await r.json() as any)?.data?.access_token || '';
  }
  const r = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j: any = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
  return j?.data ?? j;
}
const text = (v: unknown) => ({ content: [{ type: 'text' as const, text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });
const proj = (p?: string) => { const x = p || PROJECT; if (!x) throw new Error('project is required (or set XRULES_PROJECT)'); return x; };

const server = new McpServer({ name: 'xrules', version: '0.1.0' });

server.tool('list_projects', 'List xRules projects', {}, async () => text(await api('GET', '/projects')));
server.tool('list_vocabulary', 'Thai business terms and the data field each one means', { project: z.string().optional() },
  async ({ project }) => text(await api('GET', `/platform/vocabulary?project_id=${proj(project)}`)));
server.tool('suggest_terms', 'Data fields seen in requests that have no business term yet', { project: z.string().optional() },
  async ({ project }) => text(await api('GET', `/platform/vocabulary/suggest?project_id=${proj(project)}`)));
server.tool('add_term', 'Add or update a business term (term → data path)', { project: z.string().optional(), term: z.string(), path: z.string(), type: z.string().optional(), values: z.array(z.string()).optional() },
  async (a) => text(await api('POST', '/platform/vocabulary', { projectId: proj(a.project), term: a.term, path: a.path, type: a.type, values: a.values })));
server.tool('check_rule_sentence', 'Check a Thai rule sentence; returns errors with suggestions, or the canonical sentence and generated code', { project: z.string().optional(), sentence: z.string() },
  async ({ project, sentence }) => text(await api('POST', '/platform/vocabulary/check', { projectId: proj(project), sentence })));
server.tool('save_rule_draft', 'Save a Thai rule sentence as a DRAFT rule (never published)', { project: z.string().optional(), name: z.string(), sentence: z.string(), source: z.string().optional().describe('the clause of the source document') },
  async (a) => text(await api('POST', '/platform/vocabulary/rules', { projectId: proj(a.project), name: a.name, sentence: a.sentence, description: a.source ? `Source: ${a.source}` : undefined })));
server.tool('add_test_case', 'Add a test case to a decision flow / rule / API operation', {
  project: z.string().optional(), name: z.string(), targetType: z.enum(['rule', 'decision_flow', 'operation']), target: z.string(), input: z.any(),
  expectations: z.array(z.object({ kind: z.enum(['status', 'equals', 'has_finding', 'no_finding', 'max_ms']), path: z.string().optional(), value: z.any().optional(), code: z.string().optional(), severity: z.string().optional() })),
}, async (a) => text(await api('POST', '/platform/tests', { projectId: proj(a.project), name: a.name, targetType: a.targetType, targetId: a.target, input: a.input, expectations: a.expectations })));
server.tool('run_tests', 'Run all test cases of a target against its draft', { targetType: z.enum(['rule', 'decision_flow', 'api_spec']), targetId: z.string() },
  async ({ targetType, targetId }) => text(await api('POST', `/platform/tests/target/${targetType}/${targetId}/run`)));
server.tool('backtest', 'Run the draft and the published version of a decision flow over past real inputs; returns bulk run ids to compare', { project: z.string().optional(), flow: z.string(), limit: z.number().optional() },
  async (a) => text(await api('POST', '/platform/simulations/backtest', { projectId: proj(a.project), flow: a.flow, limit: a.limit })));
server.tool('bulk_status', 'Progress and summary of a bulk run, optionally compared with another run', { id: z.string(), compareTo: z.string().optional() },
  async ({ id, compareTo }) => text({ run: await api('GET', `/platform/bulk/${id}`), compare: compareTo ? await api('GET', `/platform/bulk/${id}/compare/${compareTo}`) : undefined }));
server.tool('explain_execution', 'Rule Trace of one execution: every step, its input/output and why it passed, failed or was skipped', { executionId: z.string() },
  async ({ executionId }) => text(await api('GET', `/platform/executions/${executionId}/trace`)));
server.tool('submit_for_review', 'Send a draft for review (a different person must approve before publishing)', { targetType: z.enum(['rule', 'decision_flow', 'api_spec']), targetId: z.string(), note: z.string().optional() },
  async (a) => text(await api('POST', '/platform/reviews', a)));

await server.connect(new StdioServerTransport());
