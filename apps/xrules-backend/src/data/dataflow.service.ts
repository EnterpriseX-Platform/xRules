// Data Flow runner: trigger → source → map/filter/join → quality → write Data Set snapshot.
//
// Node kinds (node.type or node.data.kind):
//   trigger  { cron?, events? }                      — start; the schedule lives on Flow.schedule
//   source   { connection, sql, params? }            — SQL (Oracle/Postgres) through a read-only connector
//            { connection, path, itemsPath? }         — HTTP JSON
//            { file: { url }, sheet?, headerRow? }    — Excel/CSV
//   map      { fields: { target: "expression" }, keep?: boolean }
//   filter   { expression }
//   join     { dataset, key: ["exprA","exprB"], as }  — add a column from another Data Set
//   quality  { checks: [{ name, expression, onFail: "reject_row"|"fail_run" }], unique?: string[], minRowRatio?: number }
//   write    { dataset, keyFields: [], piiFields?: [] }
//   notify   { url }                                  — POSTed when the run fails
import { prisma } from '../config/database.js';
import { resolveBySlug } from '../services/connections.service.js';
import { query, httpGet } from './connectors.js';
import { compile, keyOf } from './expr.js';
import { fetchFile, readSheet } from './files.js';
import * as ds from './datasets-runtime.js';
import { cronMatches } from './cron.js';

type Node = { id: string; type?: string; data?: any };
type Graph = { nodes: Node[]; edges: Array<{ source: string; target: string; sourceHandle?: string }> };
const kindOf = (n: Node) => String(n.type || n.data?.kind || '').toLowerCase();

export class RunFailed extends Error { constructor(msg: string, public report?: any) { super(msg); } }

function orderedPipeline(g: Graph): { steps: Node[]; notify: Node[] } {
  const byId = new Map(g.nodes.map(n => [n.id, n]));
  const notify = g.nodes.filter(n => ['notify', 'onfail'].includes(kindOf(n)));
  const start = g.nodes.find(n => kindOf(n) === 'trigger') || g.nodes.find(n => kindOf(n) === 'source');
  if (!start) throw new Error('Data Flow needs a trigger or source step');
  const steps: Node[] = []; const seen = new Set<string>();
  let cur: Node | undefined = start;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id); steps.push(cur);
    const next = g.edges.filter(e => e.source === cur!.id).map(e => byId.get(e.target)).find(n => n && !['notify', 'onfail'].includes(kindOf(n)));
    cur = next;
  }
  return { steps, notify };
}

export interface RunOptions { preview?: boolean; limit?: number; trigger?: string; userId?: string }

export async function runDataFlow(flowId: string, opts: RunOptions = {}) {
  const flow = await prisma.flow.findUnique({ where: { id: flowId } });
  if (!flow) throw new Error('Flow not found');
  if (flow.kind !== 'DATA') throw new Error('Not a Data Flow');
  const graph = flow.graph as unknown as Graph;
  const { steps, notify } = orderedPipeline(graph);
  const trace: any[] = [];
  const job = opts.preview ? null : await prisma.job.create({
    data: { projectId: flow.projectId, flowId: flow.id, flowVersion: flow.version, state: 'RUNNING', startedAt: new Date(), input: { trigger: opts.trigger || 'manual' } },
  });
  let rows: any[] = []; let rejected: any[] = []; let report: any = {};
  let writeStep: Node | undefined;
  try {
    for (const n of steps) {
      const t0 = Date.now(); const k = kindOf(n); const d = n.data || {}; const before = rows.length;
      if (k === 'trigger') { /* nothing */ }
      else if (k === 'source') rows = await readSource(flow.projectId, d, opts.preview ? (opts.limit || 100) : undefined);
      else if (k === 'map') {
        const fns = Object.entries(d.fields || {}).map(([t, ex]) => [t, compile(String(ex))] as const);
        rows = rows.map(r => { const o: any = d.keep ? { ...r } : {}; for (const [t, f] of fns) o[t] = f(r); return o; });
      }
      else if (k === 'filter') { const f = compile(String(d.expression)); rows = rows.filter(r => !!f(r)); }
      else if (k === 'join') {
        const keyFns = (d.key || []).map((x: string) => compile(x));
        for (const r of rows) {
          const key = keyFns.map((f: any) => { const v = f(r); return v == null ? '' : String(v).trim(); }).join('|');
          const hit = await ds.lookup(flow.projectId, d.dataset, key).catch(() => ({ found: false } as any));
          r[d.as || d.dataset] = hit.found ? hit.data : null;
        }
      }
      else if (k === 'quality') {
        const res = applyQuality(rows, d, await previousRowCount(flow.projectId, steps));
        rows = res.rows; rejected = rejected.concat(res.rejected); report = res.report;
        if (res.failed) throw new RunFailed(res.failed, report);
      }
      else if (k === 'write') { writeStep = n; }
      trace.push({ node: n.id, kind: k, rowsIn: before, rowsOut: rows.length, ms: Date.now() - t0 });
    }
    if (opts.preview) return { ok: true, rows: rows.slice(0, opts.limit || 100), rowCount: rows.length, rejected: rejected.slice(0, 50), rejectedCount: rejected.length, report, trace };
    let snapshot: any = null;
    if (writeStep) {
      const w = writeStep.data || {};
      const dset = await ds.ensureDataset(flow.projectId, w.dataset, w.keyFields);
      snapshot = await ds.writeSnapshot(dset.id, job!.id, rows, w.keyFields || dset.keyFields, w.piiFields || dset.piiFields, report, rejected.length);
      await ds.activate(dset.id, snapshot.id);
    }
    await prisma.job.update({ where: { id: job!.id }, data: { state: 'COMPLETED', statusCode: 'JOB_SUCCESS', finishedAt: new Date(), trace, output: { rowCount: rows.length, rejectedCount: rejected.length, snapshotId: snapshot?.id, report } } });
    await prisma.flow.update({ where: { id: flow.id }, data: { lastRunAt: new Date() } });
    return { ok: true, jobId: job!.id, rowCount: rows.length, rejectedCount: rejected.length, snapshotId: snapshot?.id, trace };
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (opts.preview) return { ok: false, error: msg, report: e.report || report, trace, rows: rows.slice(0, 20), rejected: rejected.slice(0, 50) };
    const w = steps.find(s => kindOf(s) === 'write')?.data;
    if (w?.dataset) {
      const dset = await ds.ensureDataset(flow.projectId, w.dataset, w.keyFields);
      await ds.rejectSnapshot(dset.id, job!.id, { error: msg, ...(e.report || report) }, rejected.length);
    }
    await prisma.job.update({ where: { id: job!.id }, data: { state: 'ERROR', statusCode: 'JOB_ERROR', error: msg, finishedAt: new Date(), trace } });
    await prisma.flow.update({ where: { id: flow.id }, data: { lastRunAt: new Date() } });
    for (const n of notify) if (n.data?.url) fetch(n.data.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'dataflow.failed', flow: flow.slug, jobId: job!.id, error: msg }) }).catch(() => {});
    return { ok: false, jobId: job!.id, error: msg };
  }
}

async function readSource(projectId: string, d: any, limit?: number): Promise<any[]> {
  if (d.file) {
    const buf = await fetchFile(d.file);
    const rows = await readSheet(buf, d.file.name || d.file.url || 'f.xlsx', d.sheet, d.headerRow || 1);
    return limit ? rows.slice(0, limit) : rows;
  }
  if (!d.connection) throw new Error('source step needs a connection');
  const rc = await resolveBySlug(projectId, d.connection);
  if (d.sql) return query(rc, d.sql, d.params || [], limit);
  if (d.path) {
    const body = await httpGet(rc, d.path);
    let items = d.itemsPath ? String(d.itemsPath).split('.').reduce((o: any, k: string) => o?.[k], body) : body;
    if (!Array.isArray(items)) throw new Error('HTTP source did not return a list');
    return limit ? items.slice(0, limit) : items;
  }
  throw new Error('source step needs sql, path or file');
}

async function previousRowCount(projectId: string, steps: Node[]): Promise<number | null> {
  const w = steps.find(s => kindOf(s) === 'write')?.data;
  if (!w?.dataset) return null;
  const d = await ds.findDataset(projectId, w.dataset);
  return d?.activeSnapshotId ? d.rowCount : null;
}

export function applyQuality(rows: any[], d: any, prevCount: number | null) {
  const checks = (d.checks || []).map((c: any) => ({ ...c, fn: compile(String(c.expression)) }));
  const kept: any[] = []; const rejected: any[] = []; const counts: Record<string, number> = {};
  let failed: string | null = null;
  for (const r of rows) {
    let bad: string | null = null;
    for (const c of checks) {
      let ok = false; try { ok = !!c.fn(r); } catch { ok = false; }
      if (!ok) { counts[c.name] = (counts[c.name] || 0) + 1; if (c.onFail === 'fail_run') failed = failed || `quality check "${c.name}" failed`; bad = bad || c.name; }
    }
    if (bad) rejected.push({ row: r, check: bad }); else kept.push(r);
  }
  if (d.unique?.length) {
    const seen = new Map<string, number>(); let dup = 0;
    for (const r of kept) { const k = keyOf(r, d.unique); seen.set(k, (seen.get(k) || 0) + 1); }
    for (const v of seen.values()) if (v > 1) dup += v - 1;
    if (dup) { counts['unique ' + d.unique.join('+')] = dup; failed = failed || `${dup} duplicate keys (${d.unique.join(' + ')})`; }
  }
  if (d.minRowRatio && prevCount && kept.length < prevCount * d.minRowRatio) {
    failed = failed || `only ${kept.length} rows, below ${Math.round(d.minRowRatio * 100)}% of the last run (${prevCount})`;
  }
  return { rows: kept, rejected, failed, report: { checked: rows.length, passed: kept.length, rejected: rejected.length, byCheck: counts } };
}

// ---------------------------------------------------------------- scheduler
let timer: NodeJS.Timeout | null = null;
const running = new Set<string>();

export function startScheduler() {
  if (timer || process.env.XRULES_SCHEDULER === 'off') return;
  const tick = async () => {
    const now = new Date();
    const flows = await prisma.flow.findMany({ where: { kind: 'DATA', status: 'PUBLISHED' }, select: { id: true, schedule: true, lastRunAt: true } });
    for (const f of flows) {
      const s: any = f.schedule || {};
      if (!s.cron || s.enabled === false || running.has(f.id)) continue;
      if (!cronMatches(s.cron, now)) continue;
      if (f.lastRunAt && now.getTime() - f.lastRunAt.getTime() < 55_000) continue;
      running.add(f.id);
      runDataFlow(f.id, { trigger: 'schedule' }).catch(() => {}).finally(() => running.delete(f.id));
    }
  };
  const align = 60_000 - (Date.now() % 60_000);
  setTimeout(() => { tick().catch(() => {}); timer = setInterval(() => tick().catch(() => {}), 60_000); }, align);
}

/** Run every published Data Flow that listens for this event (e.g. "das.published"). */
export async function emitEvent(projectId: string, event: string) {
  const flows = await prisma.flow.findMany({ where: { projectId, kind: 'DATA', status: 'PUBLISHED' } });
  const hits = flows.filter(f => ((f.schedule as any)?.events || []).includes(event));
  return Promise.all(hits.map(f => runDataFlow(f.id, { trigger: `event:${event}` })));
}
