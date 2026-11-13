// Public API gateway: /api/{tenant}/{basePath}/v{version}{operation.path}
// (legacy /api/{basePath}/v{n}/… still resolves when exactly one tenant publishes that base path)
// key → spec permission → rate limit → schema → idempotency → run published operation flow.
import { Router, type Request, type Response } from 'express';
import Ajv from 'ajv';
import { prisma } from '../config/database.js';
import { validateApiKey } from '../services/apikeys.service.js';
import { runArtifact, newRequestId } from '../platform/runner.js';
import { runBatch } from '../platform/bulk.js';

const r = Router();
const ajv = new Ajv({ allErrors: true, strict: false });
const validators = new Map<string, any>();

// ---- spec routing table (refreshed every 30 s or on demand)
type Route = { workspaceId: string; specId: string; projectId: string; opId: string; flowId: string; method: string; re: RegExp; keys: string[]; requestSchema: any };
let table = new Map<string, Route[]>(); let loadedAt = 0;
export function invalidateRoutes() { loadedAt = 0; }
async function routes() {
  if (Date.now() - loadedAt < 30_000) return table;
  const specs = await prisma.apiSpec.findMany({ where: { status: 'PUBLISHED' }, include: { operations: true, project: { select: { workspace: { select: { slug: true } } } } } });
  const t = new Map<string, Route[]>(); const legacyCount = new Map<string, number>();
  for (const s of specs) {
    const k = `${s.project.workspace.slug}/${s.basePath}/v${s.version}`;
    const legacy = `*/${s.basePath}/v${s.version}`;
    legacyCount.set(legacy, (legacyCount.get(legacy) ?? 0) + 1);
    const ops = s.operations.map(o => {
      const keys: string[] = [];
      const re = new RegExp('^' + o.path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\w+)\}|:(\w+)/g, (_m, a, b) => { keys.push(a || b); return '([^/]+)'; }) + '/?$');
      return { workspaceId: s.workspaceId, specId: s.id, projectId: s.projectId, opId: o.id, flowId: o.flowId, method: o.method, re, keys, requestSchema: o.requestSchema };
    });
    t.set(k, ops); t.set(legacy, ops);
  }
  for (const [k, n] of legacyCount) if (n > 1) t.delete(k);   // ambiguous without a tenant
  table = t; loadedAt = Date.now();
  return t;
}

// ---- rate limit: fixed window per key per minute (in-process; Redis when scaled out)
const windows = new Map<string, { m: number; n: number }>();
function allow(keyId: string, limit: number) {
  const m = Math.floor(Date.now() / 60_000);
  const w = windows.get(keyId);
  if (!w || w.m !== m) { windows.set(keyId, { m, n: 1 }); return { ok: true, left: limit - 1 }; }
  w.n++;
  return { ok: w.n <= limit, left: Math.max(0, limit - w.n) };
}

// ---- idempotency: same key + Idempotency-Key within 24 h returns the stored response
const idem = new Map<string, { at: number; status: number; body: any }>();
setInterval(() => { const cut = Date.now() - 86_400_000; for (const [k, v] of idem) if (v.at < cut) idem.delete(k); }, 600_000).unref();

const err = (res: Response, status: number, code: string, message: string, extra: any = {}) => res.status(status).json({ error: { code, message, ...extra } });

const handler = async (req: Request, res: Response, next: any) => {
  if (!/^v\d+$/.test(req.params.ver)) return next();
  const tableKey = `${req.params.tenant ?? '*'}/${req.params.base}/${req.params.ver}`;
  const requestId = (req.headers['x-request-id'] as string) || newRequestId();
  res.setHeader('X-Request-Id', requestId);
  try {
    const list = (await routes()).get(tableKey);
    if (!list) return next();
    let path = '/' + (req.params as any)[0];
    // POST …/batch → run the POST operation for each item in { items: [...] } (max 1,000)
    let batch = false;
    if (req.method === 'POST' && path.endsWith('/batch') && !list.some(x => x.re.test(path))) { batch = true; path = path.slice(0, -'/batch'.length) || '/'; }
    const candidates = list.filter(x => x.re.test(path));
    if (!candidates.length) return err(res, 404, 'NOT_FOUND', `No operation for ${req.method} ${path}`);
    const route = candidates.find(x => x.method === req.method);
    if (!route) return err(res, 405, 'METHOD_NOT_ALLOWED', `Use ${candidates.map(c => c.method).join(', ')}`);

    const raw = req.headers['x-api-key'] as string | undefined;
    if (!raw) return err(res, 401, 'UNAUTHORIZED', 'X-API-Key header is required');
    const key: any = await validateApiKey(raw);
    if (!key) return err(res, 401, 'INVALID_API_KEY', 'Invalid, expired or disabled API key');
    if (key.workspaceId !== route.workspaceId) return err(res, 403, 'FORBIDDEN', 'This key belongs to another tenant');
    if (!(key.specIds || []).includes(route.specId)) return err(res, 403, 'FORBIDDEN', 'This key may not call this API');
    const rl = allow(key.keyId, key.rateLimitPerMin || 600);
    res.setHeader('X-RateLimit-Remaining', String(rl.left));
    if (!rl.ok) return err(res, 429, 'RATE_LIMITED', 'Too many requests, try again next minute');

    const m = route.re.exec(path)!;
    const params: any = {}; route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    if (route.requestSchema && req.method !== 'GET' && !batch) {
      let v = validators.get(route.opId);
      if (!v) { v = ajv.compile(route.requestSchema); validators.set(route.opId, v); }
      if (!v(req.body)) return err(res, 400, 'INVALID_REQUEST', 'Request body does not match the schema',
        { details: v.errors.map((e: any) => ({ field: e.instancePath || e.params?.missingProperty, message: e.message })) });
    }

    if (batch) {
      const items = Array.isArray(req.body?.items) ? req.body.items : null;
      if (!items) return err(res, 400, 'INVALID_REQUEST', 'Body must be { items: [...] }');
      if (items.length > 1000) return err(res, 413, 'TOO_MANY_ITEMS', 'At most 1,000 items per batch; use a Bulk Run for more');
      if (route.requestSchema) {
        let v = validators.get(route.opId); if (!v) { v = ajv.compile(route.requestSchema); validators.set(route.opId, v); }
        const bad = items.findIndex((it: any) => !v(it));
        if (bad >= 0) return err(res, 400, 'INVALID_REQUEST', `items[${bad}] does not match the schema`, { details: v.errors });
      }
      const results = await runBatch(route.projectId, route.flowId, items, 8);
      return res.json({ count: results.length, results });
    }

    const idemKey = req.headers['idempotency-key'] as string | undefined;
    const ik = idemKey ? `${key.keyId}|${route.opId}|${idemKey}` : null;
    if (ik && idem.has(ik)) { const h = idem.get(ik)!; res.setHeader('Idempotent-Replay', 'true'); return res.status(h.status).json(h.body); }

    const result = await runArtifact(route.projectId, route.flowId, { params, query: req.query, body: req.body ?? {}, headers: { 'x-request-id': requestId } }, {
      record: { targetType: 'operation', operationId: route.opId, requestId, apiKeyId: key.keyId, ip: req.ip, ua: req.headers['user-agent'] as string },
    });
    let status = 200; let body: any = result.output;
    if (result.error) { status = 500; body = { error: { code: 'FLOW_ERROR', message: result.error, requestId } }; }
    else if (result.output?.__apiResponse) { status = result.output.status; body = result.output.body; for (const [h, v] of Object.entries(result.output.headers || {})) res.setHeader(h, String(v)); }
    if (body && typeof body === 'object' && !Array.isArray(body) && result.executionId) res.setHeader('X-Execution-Id', result.executionId);
    if (ik && status < 500) idem.set(ik, { at: Date.now(), status, body });
    res.status(status).json(body);
  } catch (e: any) {
    err(res, 500, 'INTERNAL_ERROR', e?.message || 'Gateway error', { requestId });
  }
};
r.all('/:tenant/:base/:ver/*', handler);
r.all('/:base/:ver/*', handler);

export default r;
