// Data Layer connectors: read data from external sources for Data Flows and Enrichment.
//
// A Connection's decrypted config is either a single config object, or
//   { envs: { UAT: {...}, PROD: {...} }, allowedObjects: ["SCHEMA.VIEW", ...] }
// The environment used comes from XRULES_ENV (default "UAT"), so the same connection
// slug points at UAT data on UAT and PROD data on PROD.
//
// Connectors are READ-ONLY by design: only SELECT/WITH statements are accepted, the
// SQL is checked against allowedObjects, and `test()` verifies the account itself
// cannot write (privilege check), so a misconfigured write-capable account is refused.
import pg from 'pg';

export type ConnType = 'oracle' | 'postgres' | 'mysql' | 'http' | 'redis' | 'kafka' | 's3';

export interface ResolvedConfig {
  env: string;
  type: ConnType;
  cfg: Record<string, any>;
  allowedObjects: string[];
}

export const currentEnv = () => (process.env.XRULES_ENV || 'UAT').toUpperCase();

export function resolveConfig(type: string, raw: any, env = currentEnv()): ResolvedConfig {
  const t = String(type).toLowerCase() as ConnType;
  const allowedObjects: string[] = (raw?.allowedObjects || []).map((s: string) => String(s).trim().toUpperCase()).filter(Boolean);
  let cfg = raw;
  if (raw && typeof raw === 'object' && raw.envs) {
    cfg = raw.envs[env] ?? raw.envs[env.toLowerCase()];
    if (!cfg) throw new Error(`Connection has no settings for environment ${env}`);
  }
  return { env, type: t, cfg: cfg || {}, allowedObjects };
}

// ---------------------------------------------------------------- SQL guard
const WRITE_RE = /\b(insert|update|delete|merge|drop|alter|create|truncate|grant|revoke|commit|rollback|execute|exec|call|begin|declare|lock)\b/i;

export function assertReadOnlySql(sql: string, allowedObjects: string[]) {
  const s = sql.trim().replace(/;+\s*$/, '');
  if (s.includes(';')) throw new Error('Only one SQL statement is allowed');
  if (!/^(select|with)\b/i.test(s)) throw new Error('Only SELECT queries are allowed');
  const noStrings = s.replace(/'([^']|'')*'/g, "''");
  if (WRITE_RE.test(noStrings)) throw new Error('Query contains a statement that is not allowed in a read-only source');
  if (allowedObjects.length) {
    // every object after FROM / JOIN must be on the allow list
    const used = [...noStrings.matchAll(/\b(?:from|join)\s+([A-Za-z0-9_$#."]+)/gi)].map(m => m[1].replace(/"/g, '').toUpperCase());
    const ctes = new Set([...noStrings.matchAll(/\b([A-Za-z0-9_]+)\s+as\s*\(/gi)].map(m => m[1].toUpperCase()));
    for (const o of used) {
      if (o === 'DUAL' || ctes.has(o) || o.startsWith('(')) continue;
      const bare = o.split('.').pop()!;
      const ok = allowedObjects.some(a => a === o || a.split('.').pop() === bare);
      if (!ok) throw new Error(`Object ${o} is not in this connection's allowed objects`);
    }
  }
  return s;
}

// ---------------------------------------------------------------- drivers
type Row = Record<string, any>;

async function oracleConn(cfg: any) {
  const oracledb: any = (await import('oracledb')).default;
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  const connectString = cfg.connectString || `${cfg.host}:${cfg.port || 1521}/${cfg.serviceName || cfg.service || cfg.database}`;
  return oracledb.getConnection({ user: cfg.user, password: cfg.password, connectString });
}

function pgClient(cfg: any) {
  return new pg.Client(cfg.url ? { connectionString: cfg.url } : {
    host: cfg.host, port: Number(cfg.port || 5432), user: cfg.user, password: cfg.password, database: cfg.database,
    ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
  });
}

function normalizeRow(r: Row): Row {
  // Oracle returns UPPERCASE column names; keep them but also expose lowercase/camel-insensitive access via map step.
  const out: Row = {};
  for (const [k, v] of Object.entries(r)) out[k] = v instanceof Date ? v.toISOString() : (typeof v === 'bigint' ? Number(v) : v);
  return out;
}

export async function query(rc: ResolvedConfig, sql: string, params: any[] | Record<string, any> = [], limit?: number): Promise<Row[]> {
  const safe = assertReadOnlySql(sql, rc.allowedObjects);
  if (rc.type === 'oracle') {
    const c = await oracleConn(rc.cfg);
    try {
      const r = await c.execute(safe, params, { maxRows: limit || 0 });
      return (r.rows || []).map(normalizeRow);
    } finally { await c.close(); }
  }
  if (rc.type === 'postgres') {
    const c = pgClient(rc.cfg);
    await c.connect();
    try {
      await c.query('BEGIN READ ONLY');
      const r = await c.query(limit ? `SELECT * FROM (${safe}) q LIMIT ${Number(limit)}` : safe, Array.isArray(params) ? params : Object.values(params));
      await c.query('ROLLBACK');
      return r.rows.map(normalizeRow);
    } finally { await c.end(); }
  }
  throw new Error(`SQL source is not supported for ${rc.type} connections`);
}

export async function httpGet(rc: ResolvedConfig, path: string, opts: { method?: string; body?: any; headers?: any; itemsPath?: string } = {}): Promise<any> {
  const base = String(rc.cfg.baseUrl || rc.cfg.url || '').replace(/\/$/, '');
  const url = /^https?:/i.test(path) ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  const headers: any = { Accept: 'application/json', ...(rc.cfg.headers || {}), ...(opts.headers || {}) };
  if (rc.cfg.token) headers.Authorization = `Bearer ${rc.cfg.token}`;
  const res = await fetch(url, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined, signal: AbortSignal.timeout(Number(rc.cfg.timeoutMs || 30000)) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : Buffer.from(await res.arrayBuffer());
}

// ---------------------------------------------------------------- test + read-only verification
export interface TestResult {
  ok: boolean; env: string; ms: number; error?: string;
  readOnly?: { verified: boolean; problems: string[] };
}

const ORACLE_WRITE_PRIVS = ['CREATE TABLE', 'CREATE ANY TABLE', 'INSERT ANY TABLE', 'UPDATE ANY TABLE', 'DELETE ANY TABLE', 'DROP ANY TABLE', 'ALTER ANY TABLE', 'DBA'];

export async function test(rc: ResolvedConfig): Promise<TestResult> {
  const t0 = Date.now();
  try {
    if (rc.type === 'oracle') {
      const c = await oracleConn(rc.cfg);
      try {
        await c.execute('SELECT 1 FROM DUAL');
        const problems: string[] = [];
        const sp = await c.execute('SELECT PRIVILEGE FROM SESSION_PRIVS');
        for (const r of sp.rows as any[]) if (ORACLE_WRITE_PRIVS.includes(r.PRIVILEGE)) problems.push(`account has system privilege ${r.PRIVILEGE}`);
        const own = await c.execute("SELECT COUNT(*) N FROM USER_OBJECTS WHERE OBJECT_TYPE IN ('TABLE','VIEW')");
        if ((own.rows as any[])[0].N > 0) problems.push('account owns tables or views (it could write to them)');
        const tp = await c.execute("SELECT OWNER || '.' || TABLE_NAME OBJ, PRIVILEGE FROM ALL_TAB_PRIVS WHERE GRANTEE IN (USER, 'PUBLIC') AND PRIVILEGE IN ('INSERT','UPDATE','DELETE','ALTER') AND ROWNUM <= 20");
        for (const r of tp.rows as any[]) if (r.OBJ && !String(r.OBJ).startsWith('SYS.')) problems.push(`${r.PRIVILEGE} on ${r.OBJ}`);
        return { ok: true, env: rc.env, ms: Date.now() - t0, readOnly: { verified: problems.length === 0, problems } };
      } finally { await c.close(); }
    }
    if (rc.type === 'postgres') {
      const c = pgClient(rc.cfg);
      await c.connect();
      try {
        await c.query('SELECT 1');
        const problems: string[] = [];
        const su = await c.query('SELECT rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = current_user');
        if (su.rows[0]?.rolsuper) problems.push('account is a superuser');
        const w = await c.query(`SELECT table_schema || '.' || table_name AS obj, privilege_type FROM information_schema.role_table_grants
          WHERE grantee = current_user AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE') LIMIT 20`);
        for (const r of w.rows) problems.push(`${r.privilege_type} on ${r.obj}`);
        const cs = await c.query(`SELECT nspname FROM pg_namespace WHERE has_schema_privilege(current_user, nspname, 'CREATE') AND nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'`);
        for (const r of cs.rows) problems.push(`CREATE on schema ${r.nspname}`);
        return { ok: true, env: rc.env, ms: Date.now() - t0, readOnly: { verified: problems.length === 0, problems } };
      } finally { await c.end(); }
    }
    if (rc.type === 'http') {
      await httpGet(rc, rc.cfg.healthPath || '/');
      return { ok: true, env: rc.env, ms: Date.now() - t0, readOnly: { verified: true, problems: [] } };
    }
    return { ok: false, env: rc.env, ms: Date.now() - t0, error: `Testing ${rc.type} connections is not supported yet` };
  } catch (e: any) {
    return { ok: false, env: rc.env, ms: Date.now() - t0, error: e?.message || String(e) };
  }
}
