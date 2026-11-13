// Bulk Runs: run a rule / decision flow / API operation flow over many rows.
// Rows are stored first (bulk_run_rows), then a queue job processes them in chunks with a
// concurrency limit. Version and data snapshots are fixed for the whole run.
import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from '../services/_access.js';
import type { AuthUser } from '../middleware/auth.js';
import { enqueue, registerHandler } from './queue.js';
import { loadFlow, runArtifact } from './runner.js';
import { readSheet } from '../data/files.js';
import { resolveBySlug } from '../services/connections.service.js';
import { query } from '../data/connectors.js';

const CHUNK = 200;
const MAX_ROWS = 500_000;

function applyMapping(row: any, mapping: any): any {
  if (!mapping) return row;
  const render = (v: any): any => {
    if (typeof v === 'string') { const m = v.match(/^\{\{\s*(.+?)\s*\}\}$/); return m ? row[m[1]] : v; }
    if (Array.isArray(v)) return v.map(render);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, render(x)]));
    return v;
  };
  return render(mapping);
}

async function loadRows(projectId: string, source: any): Promise<any[]> {
  if (source.kind === 'rows') return source.rows || [];
  if (source.kind === 'file') return readSheet(Buffer.from(source.contentBase64, 'base64'), source.name || 'file.xlsx', source.sheet, source.headerRow || 1);
  if (source.kind === 'dataset') {
    const ds = await prisma.dataset.findUnique({ where: { projectId_slug: { projectId, slug: source.dataset } } });
    if (!ds?.activeSnapshotId) throw new ValidationError(`Data Set '${source.dataset}' has no active snapshot`);
    const rows = await prisma.datasetRow.findMany({ where: { snapshotId: ds.activeSnapshotId }, take: source.limit || MAX_ROWS, orderBy: { id: 'asc' }, select: { data: true } });
    return rows.map(r => r.data);
  }
  if (source.kind === 'executions') {
    // past real inputs: of a flow (decision flow) or of an API operation (request body)
    const where: any = { createdAt: { gte: source.since ? new Date(source.since) : new Date(Date.now() - 30 * 86400_000) }, targetType: { not: 'challenger' } };
    if (source.operationId) where.operationId = source.operationId; else where.flowId = source.flowId;
    const ex = await prisma.execution.findMany({ where, orderBy: { createdAt: 'desc' }, take: source.limit || 5000, select: { input: true } });
    return ex.map(e => (source.operationId ? (e.input as any)?.body : e.input));
  }
  if (source.kind === 'sql') return query(await resolveBySlug(projectId, source.connection), source.sql, source.params || [], source.limit);
  throw new ValidationError('source.kind must be rows, file, dataset or sql');
}

export async function createBulkRun(data: { projectId: string; name?: string; targetType: 'decision_flow' | 'rule' | 'operation'; target: string; source: any; mapping?: any; concurrency?: number; compareToId?: string }, user: AuthUser) {
  const p = await assertProjectAccess(data.projectId, user, 'write');
  if (!['decision_flow', 'rule', 'operation'].includes(data.targetType)) throw new ValidationError('targetType must be decision_flow, rule or operation');
  let targetId = data.target; let targetVersion: number | undefined;
  if (data.targetType === 'rule') {
    const r = await prisma.rule.findFirst({ where: { projectId: p.id, OR: [{ id: data.target }, { slug: data.target }] } });
    if (!r) throw new NotFoundError('Rule'); targetId = r.id; targetVersion = r.version;
  } else {
    let flowRef = data.target;
    if (data.targetType === 'operation') { const op = await prisma.apiOperation.findUnique({ where: { id: data.target } }); if (!op) throw new NotFoundError('Operation'); flowRef = op.flowId; }
    const art = await loadFlow(p.id, flowRef, { draft: !!data.source?.draft }); targetId = art.id; targetVersion = data.source?.draft ? undefined : art.version;
  }
  const rows = await loadRows(p.id, data.source);
  if (!rows.length) throw new ValidationError('No rows to run');
  if (rows.length > MAX_ROWS) throw new ValidationError(`At most ${MAX_ROWS} rows per run`);
  const { contentBase64: _drop, rows: _r, ...sourceMeta } = data.source || {};
  const run = await prisma.bulkRun.create({ data: {
    projectId: p.id, name: data.name, targetType: data.targetType, targetId, targetVersion, source: sourceMeta, mapping: data.mapping,
    total: rows.length, concurrency: Math.min(Math.max(data.concurrency || 8, 1), 32), createdBy: user.email || user.userId, compareToId: data.compareToId,
  } });
  for (let i = 0; i < rows.length; i += 1000) {
    await prisma.bulkRunRow.createMany({ data: rows.slice(i, i + 1000).map((r, k) => ({ runId: run.id, idx: i + k, input: applyMapping(r, data.mapping) ?? {} })) });
  }
  await enqueue('bulk.run', { runId: run.id }, { dedupeKey: `bulk:${run.id}:start` });
  return run;
}

async function runOne(run: any, input: any): Promise<{ output: any; status: string; error?: string; ms: number }> {
  const t0 = Date.now();
  try {
    let output: any;
    if (run.targetType === 'rule') {
      const { executeRule } = await import('../services/execute.service.js');
      output = (await executeRule(run.targetId, input, {}, { userId: '__system__', email: 'bulk@xrules', tenantId: '*', roles: ['OWNER'] } as any) as any).output;
    } else {
      const body = run.targetType === 'operation' ? { params: {}, query: {}, body: input } : input;
      const r = await runArtifact(run.projectId, run.targetId, body, run.source?.draft ? { draft: true } : { version: run.targetVersion ?? undefined });
      if (r.error) throw new Error(r.error);
      output = r.output?.__apiResponse ? r.output.body : r.output;
    }
    const passed = output?.passed !== false && output?.pass !== false && output?.valid !== false;
    return { output, status: passed ? 'PASSED' : 'FAILED', ms: Date.now() - t0 };
  } catch (e: any) {
    return { output: null, status: 'ERROR', error: e?.message || String(e), ms: Date.now() - t0 };
  }
}

async function processRun(runId: string) {
  let run = await prisma.bulkRun.findUnique({ where: { id: runId } });
  if (!run || ['COMPLETED', 'CANCELLED', 'PAUSED'].includes(run.status)) return;
  if (run.status === 'QUEUED') run = await prisma.bulkRun.update({ where: { id: runId }, data: { status: 'RUNNING', startedAt: run.startedAt ?? new Date() } });
  for (;;) {
    const fresh = await prisma.bulkRun.findUnique({ where: { id: runId }, select: { status: true } });
    if (!fresh || fresh.status !== 'RUNNING') return;   // paused or cancelled between chunks
    const rows = await prisma.bulkRunRow.findMany({ where: { runId, status: 'PENDING' }, orderBy: { idx: 'asc' }, take: CHUNK });
    if (!rows.length) break;
    let i = 0;
    const results: any[] = new Array(rows.length);
    await Promise.all(Array.from({ length: run.concurrency }, async () => {
      for (;;) { const k = i++; if (k >= rows.length) return; results[k] = await runOne(run, rows[k].input); }
    }));
    await prisma.$transaction(rows.map((r, k) => prisma.bulkRunRow.update({ where: { id: r.id }, data: { output: results[k].output ?? undefined, status: results[k].status, error: results[k].error, ms: results[k].ms } })));
    await refreshCounts(runId);
  }
  const summary = await summarize(runId);
  await prisma.bulkRun.update({ where: { id: runId }, data: { status: 'COMPLETED', finishedAt: new Date(), summary } });
}

async function refreshCounts(runId: string) {
  const g = await prisma.bulkRunRow.groupBy({ by: ['status'], where: { runId }, _count: true });
  const c = Object.fromEntries(g.map(x => [x.status, x._count as number]));
  await prisma.bulkRun.update({ where: { id: runId }, data: { passed: c.PASSED || 0, failed: c.FAILED || 0, errored: c.ERROR || 0, processed: (c.PASSED || 0) + (c.FAILED || 0) + (c.ERROR || 0) } });
}

async function summarize(runId: string) {
  const byRule: Record<string, Record<string, number>> = {};
  let cursor: bigint | undefined;
  for (;;) {
    const rows = await prisma.bulkRunRow.findMany({ where: { runId, status: { in: ['FAILED', 'PASSED'] } }, take: 2000, orderBy: { id: 'asc' }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, output: true } });
    if (!rows.length) break;
    for (const r of rows) for (const f of ((r.output as any)?.findings || [])) {
      byRule[f.ruleCode] = byRule[f.ruleCode] || {}; byRule[f.ruleCode][f.severity] = (byRule[f.ruleCode][f.severity] || 0) + 1;
    }
    cursor = rows[rows.length - 1].id;
  }
  return { byRule };
}

registerHandler('bulk.run', async (p) => processRun(p.runId));

// ---------------------------------------------------------------- control + results
async function runFor(id: string, user: AuthUser, perm: 'read' | 'write' = 'read') {
  const run = await prisma.bulkRun.findUnique({ where: { id } });
  if (!run) throw new NotFoundError('Bulk run');
  await assertProjectAccess(run.projectId, user, perm);
  return run;
}
export async function list(projectIdOrSlug: string, user: AuthUser) {
  const p = await assertProjectAccess(projectIdOrSlug, user);
  return prisma.bulkRun.findMany({ where: { projectId: p.id }, orderBy: { createdAt: 'desc' }, take: 100 });
}
export const get = (id: string, user: AuthUser) => runFor(id, user);
export async function setStatus(id: string, action: 'pause' | 'resume' | 'cancel' | 'retry_errors', user: AuthUser) {
  const run = await runFor(id, user, 'write');
  if (action === 'pause' && run.status === 'RUNNING') return prisma.bulkRun.update({ where: { id }, data: { status: 'PAUSED' } });
  if (action === 'cancel' && !['COMPLETED', 'CANCELLED'].includes(run.status)) return prisma.bulkRun.update({ where: { id }, data: { status: 'CANCELLED', finishedAt: new Date() } });
  if (action === 'resume' && run.status === 'PAUSED') { await prisma.bulkRun.update({ where: { id }, data: { status: 'RUNNING' } }); await enqueue('bulk.run', { runId: id }); return runFor(id, user); }
  if (action === 'retry_errors') {
    await prisma.bulkRunRow.updateMany({ where: { runId: id, status: 'ERROR' }, data: { status: 'PENDING', error: null } });
    await prisma.bulkRun.update({ where: { id }, data: { status: 'RUNNING', finishedAt: null } });
    await enqueue('bulk.run', { runId: id }); return runFor(id, user);
  }
  throw new ValidationError(`Cannot ${action} a ${run.status.toLowerCase()} run`);
}
export async function rows(id: string, user: AuthUser, o: { status?: string; offset?: number; limit?: number }) {
  await runFor(id, user);
  return prisma.bulkRunRow.findMany({ where: { runId: id, ...(o.status ? { status: o.status } : {}) }, orderBy: { idx: 'asc' }, skip: o.offset || 0, take: Math.min(o.limit || 100, 1000) });
}
const csvCell = (v: any) => { const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** CSV: original columns + result, error and finding codes. Streamed in pages. */
export async function* resultsCsv(id: string, user: AuthUser) {
  await runFor(id, user);
  const first = await prisma.bulkRunRow.findFirst({ where: { runId: id }, orderBy: { idx: 'asc' } });
  const cols = Object.keys((first?.input as any) || {});
  yield '﻿' + [...cols, 'ผล', 'ข้อผิดพลาด', 'findings'].map(csvCell).join(',') + '\n';
  let cursor: bigint | undefined;
  for (;;) {
    const page = await prisma.bulkRunRow.findMany({ where: { runId: id }, orderBy: { id: 'asc' }, take: 2000, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!page.length) break;
    yield page.map(r => [...cols.map(c => (r.input as any)?.[c]), r.status, r.error, ((r.output as any)?.findings || []).map((f: any) => `${f.severity}:${f.ruleCode}`).join(' ')].map(csvCell).join(',')).join('\n') + '\n';
    cursor = page[page.length - 1].id;
  }
}
/** Rows whose result differs between two runs over the same input order. */
export async function compare(id: string, otherId: string, user: AuthUser) {
  await runFor(id, user); await runFor(otherId, user);
  const diff = await prisma.$queryRawUnsafe<any[]>(`
    SELECT a.idx, a.status AS "now", b.status AS "before", a.input
    FROM bulk_run_rows a JOIN bulk_run_rows b ON b."runId" = $2 AND b.idx = a.idx
    WHERE a."runId" = $1 AND a.status <> b.status ORDER BY a.idx LIMIT 1000`, id, otherId);
  const counts: Record<string, number> = {};
  for (const d of diff) counts[`${d.before}→${d.now}`] = (counts[`${d.before}→${d.now}`] || 0) + 1;
  return { changed: diff.length, counts, rows: diff };
}

/** Synchronous batch for the gateway: up to 1,000 items, run with limited concurrency. */
export async function runBatch(projectId: string, flowId: string, items: any[], concurrency = 8) {
  const out: any[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) { const k = i++; if (k >= items.length) return;
      const r = await runArtifact(projectId, flowId, { params: {}, query: {}, body: items[k] });
      out[k] = r.error ? { error: r.error } : r.output?.__apiResponse ? r.output.body : r.output; }
  }));
  return out;
}

/** Backtest: run the published version and the draft over the same past inputs, then compare. */
export async function backtest(data: { projectId: string; flow: string; since?: string; limit?: number; operationId?: string }, user: AuthUser) {
  const p = await assertProjectAccess(data.projectId, user, 'write');
  const f = await prisma.flow.findFirst({ where: { projectId: p.id, OR: [{ id: data.flow }, { slug: data.flow }] } });
  if (!f) throw new NotFoundError('Flow');
  const src = { kind: 'executions', flowId: f.id, operationId: data.operationId, since: data.since, limit: data.limit || 2000 };
  const live = await createBulkRun({ projectId: p.id, name: `จำลอง: ${f.slug} (ตัวจริง)`, targetType: 'decision_flow', target: f.id, source: src }, user);
  const draft = await createBulkRun({ projectId: p.id, name: `จำลอง: ${f.slug} (ร่าง)`, targetType: 'decision_flow', target: f.id, source: { ...src, draft: true }, compareToId: live.id }, user);
  return { liveRunId: live.id, draftRunId: draft.id, compareUrl: `/platform/bulk/${draft.id}/compare/${live.id}` };
}
