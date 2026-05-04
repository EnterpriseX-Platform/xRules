// Parse DR-compatible solver headers off the request.
// Accept either api-key (Kafka-style) or X-API-Key / Authorization: Bearer.
import type { Request } from 'express';

export interface SolverContext {
  strategy?: string;             // X-Strategy
  lookupMethod?: string;         // X-Lookup-Method
  correlationId?: string;        // X-Correlation-Id (auto-generate if absent)
  audit: boolean;                // X-Audit
  auditTtlDays: number;          // X-Audit-Ttl
}

export function parseSolverHeaders(req: Request): SolverContext {
  const h = req.headers;
  const correlationId =
    (h['x-correlation-id'] as string) ||
    'cor-' + Math.random().toString(36).slice(2, 12);

  const auditRaw = (h['x-audit'] as string)?.toLowerCase();
  const audit = auditRaw === 'true' || auditRaw === '1';
  const auditTtl = parseInt(h['x-audit-ttl'] as string, 10);

  return {
    strategy:     normalizeStrategy(h['x-strategy'] as string),
    lookupMethod: normalizeLookup(h['x-lookup-method'] as string),
    correlationId,
    audit,
    auditTtlDays: Number.isFinite(auditTtl) ? auditTtl : 14,
  };
}

function normalizeStrategy(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const u = v.toUpperCase().replace(/[^A-Z_]/g, '');
  const valid = ['STANDARD', 'FIRST_MATCH', 'ARRAY', 'EVALUATE_ALL'];
  return valid.includes(u) ? u : undefined;
}
function normalizeLookup(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const u = v.toUpperCase();
  return ['LOOKUP_VALUE', 'LOOKUP_EXISTS'].includes(u) ? u : undefined;
}

// Compare actual output vs expected, ignoring JSONPaths (e.g. "$.timestamp")
export function applyIgnoredPaths(value: any, ignored: string[]): any {
  if (!ignored?.length) return value;
  const cloned = JSON.parse(JSON.stringify(value));
  for (const p of ignored) {
    const segments = parseJsonPath(p);
    deletePath(cloned, segments);
  }
  return cloned;
}

function parseJsonPath(s: string): (string | number)[] {
  // Minimal JSONPath: "$.foo.bar[2].baz"
  const out: (string | number)[] = [];
  const trimmed = s.replace(/^\$\.?/, '');
  if (!trimmed) return out;
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let m;
  while ((m = re.exec(trimmed))) {
    if (m[2] !== undefined) out.push(Number(m[2]));
    else out.push(m[1]);
  }
  return out;
}

function deletePath(obj: any, path: (string | number)[]): void {
  if (!path.length || obj == null) return;
  const last = path[path.length - 1];
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    cur = cur?.[path[i]];
    if (cur == null) return;
  }
  if (Array.isArray(cur) && typeof last === 'number') cur.splice(last, 1);
  else if (cur && typeof cur === 'object') delete cur[last as any];
}
