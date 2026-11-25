// ML inside the existing structure (TOR 4.13):
//   Data Sets › Prepare  — profile (stats, outliers, correlation, relevance) and prepare steps → new snapshot
//   Models › Train       — algorithm + parameters (+ grid/random search) on a Data Set → model version + report
//   Models › Publish     — evaluation gate (metric ≥ threshold) and approval, like rules
//   Rules › Model Call   — predictions inside decision flows → REST APIs
// The maths runs in apps/xrules-ml (scikit-learn) at XRULES_ML_URL; this module owns data, versions and access.
import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from '../services/_access.js';
import type { AuthUser } from '../middleware/auth.js';
import { registerHandler, enqueue } from './queue.js';
import { writeSnapshot, activate } from '../data/datasets-runtime.js';
import { resolveRef } from './scope.js';

const ML = () => process.env.XRULES_ML_URL || 'http://localhost:4600';
const MAX_ROWS = Number(process.env.XRULES_ML_MAX_ROWS || 200_000);

async function ml<T = any>(path: string, body: any, timeoutMs = 600_000): Promise<{ status: number; data: T }> {
  const r = await fetch(`${ML()}${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs) })
    .catch((e: any) => { throw new ValidationError(`ML service unavailable (${e?.message || e})`); });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 409) throw new ValidationError(typeof data?.detail === 'string' ? data.detail : data?.detail?.[0]?.msg || `ML service error ${r.status}`);
  return { status: r.status, data };
}

export const catalogue = () => ml('/catalogue', null, 10_000).then(r => r.data);

// ---------------------------------------------------------------- data
async function datasetRows(datasetId: string, snapshotId?: string) {
  const ds = await prisma.dataset.findUnique({ where: { id: datasetId } });
  if (!ds) throw new NotFoundError('Data Set');
  const sid = snapshotId || ds.activeSnapshotId;
  if (!sid) throw new ValidationError(`Data Set ${ds.slug} has no active snapshot yet`);
  const rows = await prisma.datasetRow.findMany({ where: { snapshotId: sid }, select: { data: true }, take: MAX_ROWS, orderBy: { idx: 'asc' } });
  return { ds, snapshotId: sid, rows: rows.map(r => r.data as any) };
}

export async function profileDataset(datasetId: string, body: { target?: string; outlier?: string }, user: AuthUser) {
  const { ds, rows } = await datasetRows(datasetId);
  await assertProjectAccess(ds.projectId, user);
  return (await ml('/profile', { rows, target: body.target || null, outlier: body.outlier || 'iqr' })).data;
}

/** preview=true returns the first 50 rows and the fitted values; otherwise writes and activates a new snapshot. */
export async function prepareDataset(datasetId: string, body: { steps: any[]; preview?: boolean }, user: AuthUser) {
  if (!Array.isArray(body.steps) || !body.steps.length) throw new ValidationError('Add at least one step');
  const { ds, snapshotId, rows } = await datasetRows(datasetId);
  await assertProjectAccess(ds.projectId, user, 'write');
  const out = (await ml<any>('/prepare', { rows, steps: body.steps })).data;
  if (body.preview) return { rows: out.rows.slice(0, 50), total: out.rows.length, columns: out.columns, fitted: out.fitted };
  const report = { prepared: { from: snapshotId, steps: body.steps, fitted: out.fitted, by: user.email, at: new Date().toISOString() } };
  const snap = await writeSnapshot(ds.id, null, out.rows, ds.keyFields, ds.piiFields, report, rows.length - out.rows.length);
  await activate(ds.id, snap.id);
  await prisma.dataset.update({ where: { id: ds.id }, data: { rowCount: out.rows.length } }).catch(() => {});
  return { snapshotId: snap.id, rows: out.rows.length, columns: out.columns, fitted: out.fitted };
}

// ---------------------------------------------------------------- models
const fmtVersion = (v: any) => ({ id: v.id, modelId: v.modelId, version: v.version, status: v.status.toLowerCase(), config: v.config, report: v.report, error: v.error,
  createdAt: v.createdAt.toISOString(), trainedAt: v.trainedAt?.toISOString() ?? null, publishedAt: v.publishedAt?.toISOString() ?? null, hasArtifact: !!v.artifact });

async function modelFor(id: string, user: AuthUser, perm: 'read' | 'write' = 'read') {
  const m = await prisma.model.findFirst({ where: { OR: [{ id }, { slug: id }] } });
  if (!m) throw new NotFoundError('Model');
  await assertProjectAccess(m.projectId, user, perm);
  return m;
}

export async function listVersions(modelId: string, user: AuthUser) {
  const m = await modelFor(modelId, user);
  const vs = await prisma.modelVersion.findMany({ where: { modelId: m.id }, orderBy: { version: 'desc' }, select: { id: true, modelId: true, version: true, status: true, config: true, report: true, error: true, createdAt: true, trainedAt: true, publishedAt: true } });
  return vs.map(v => fmtVersion(v));
}

export async function getVersion(versionId: string, user: AuthUser) {
  const v = await prisma.modelVersion.findUnique({ where: { id: versionId }, include: { model: true } });
  if (!v) throw new NotFoundError('Model version');
  await assertProjectAccess(v.model.projectId, user);
  return { ...fmtVersion(v), model: { id: v.model.id, slug: v.model.slug, name: v.model.name, config: v.model.config } };
}

/** Start a training run; the queue worker calls the ML service and stores report + artifact. */
export async function train(modelId: string, body: any, user: AuthUser) {
  const m = await modelFor(modelId, user, 'write');
  if (!body.dataset) throw new ValidationError('Choose a Data Set');
  if (!body.algorithm) throw new ValidationError('Choose an algorithm');
  if (!Array.isArray(body.features) || !body.features.length) throw new ValidationError('Choose at least one feature');
  const ds = await resolveRef<any>('dataset', m.projectId, String(body.dataset));
  if (!ds) throw new NotFoundError(`Data Set ${body.dataset}`);
  if (!ds.activeSnapshotId) throw new ValidationError(`Data Set ${ds.slug} has no active snapshot yet`);
  const last = await prisma.modelVersion.findFirst({ where: { modelId: m.id }, orderBy: { version: 'desc' } });
  const config = { dataset: ds.slug, datasetId: ds.id, snapshotId: ds.activeSnapshotId, algorithm: body.algorithm, target: body.target || null,
    features: body.features, params: body.params || {}, scaler: body.scaler || 'standard', testSize: Number(body.testSize ?? 0.2),
    search: body.search && Object.keys(body.search.params || {}).length ? body.search : null, seed: Number(body.seed ?? 42) };
  const v = await prisma.modelVersion.create({ data: { modelId: m.id, version: (last?.version ?? 0) + 1, status: 'TRAINING', config, createdById: user.userId } });
  await enqueue('ml.train', { versionId: v.id });
  return fmtVersion(v);
}

registerHandler('ml.train', async ({ versionId }: { versionId: string }) => {
  const v = await prisma.modelVersion.findUnique({ where: { id: versionId } });
  if (!v || v.status !== 'TRAINING') return;
  const c: any = v.config;
  try {
    const { rows } = await datasetRows(c.datasetId, c.snapshotId);
    const r = await ml<any>('/train', { rows, algorithm: c.algorithm, target: c.target, features: c.features, params: c.params, scaler: c.scaler, testSize: c.testSize, search: c.search, seed: c.seed });
    await prisma.modelVersion.update({ where: { id: v.id }, data: { status: 'READY', report: r.data.report, artifact: Buffer.from(r.data.artifact, 'base64'), trainedAt: new Date() } });
  } catch (e: any) {
    await prisma.modelVersion.update({ where: { id: v.id }, data: { status: 'FAILED', error: String(e?.message || e).slice(0, 2000) } });
  }
});

/** The headline metric a gate checks, per task. */
const HEADLINE: Record<string, string> = { classification: 'f1', regression: 'r2', clustering: 'silhouette' };

/** Publish one version: it must pass the model's evaluation gate (model.config.gate = { metric, min }). */
export async function publish(versionId: string, user: AuthUser) {
  const v = await prisma.modelVersion.findUnique({ where: { id: versionId }, include: { model: true } });
  if (!v) throw new NotFoundError('Model version');
  await assertProjectAccess(v.model.projectId, user, 'write');
  if (v.status !== 'READY' && v.status !== 'RETIRED') throw new ValidationError(`Version ${v.version} is ${v.status.toLowerCase()}`);
  const rep: any = v.report || {};
  const gate: any = (v.model.config as any)?.gate;
  const metric = gate?.metric || HEADLINE[rep.task];
  const value = rep.metrics?.[metric];
  if (gate?.min !== undefined && (value === undefined || value === null || Number(value) < Number(gate.min)))
    throw new ValidationError(`Evaluation gate: ${metric} ${value ?? 'n/a'} is below ${gate.min}`);
  await prisma.$transaction([
    prisma.modelVersion.updateMany({ where: { modelId: v.modelId, status: 'PUBLISHED' }, data: { status: 'RETIRED' } }),
    prisma.modelVersion.update({ where: { id: v.id }, data: { status: 'PUBLISHED', publishedAt: new Date() } }),
    prisma.model.update({ where: { id: v.modelId }, data: { status: 'ACTIVE', version: String(v.version) } }),
  ]);
  return getVersion(v.id, user);
}

export async function setGate(modelId: string, gate: { metric?: string; min?: number | null }, user: AuthUser) {
  const m = await modelFor(modelId, user, 'write');
  const cfg: any = { ...(m.config as any || {}), gate: gate.min === null || gate.min === undefined ? undefined : { metric: gate.metric, min: Number(gate.min) } };
  await prisma.model.update({ where: { id: m.id }, data: { config: cfg } });
  return { gate: cfg.gate ?? null };
}

/** Predict with the published version (or a given one). Used by Model Call rules and the Try panel. */
export async function predict(projectId: string, modelRef: string, rows: any[], o: { versionId?: string; version?: number } = {}) {
  // own project first, then anywhere in the tenant
  const m = await prisma.model.findFirst({ where: { projectId, OR: [{ id: modelRef }, { slug: modelRef }] } })
    ?? await prisma.model.findFirst({ where: { OR: [{ id: modelRef }, { slug: modelRef }], project: { workspace: { projects: { some: { id: projectId } } } } } });
  if (!m) throw new NotFoundError(`Model ${modelRef}`);
  const v = o.versionId ? await prisma.modelVersion.findUnique({ where: { id: o.versionId } })
    : o.version ? await prisma.modelVersion.findFirst({ where: { modelId: m.id, version: Number(o.version) } })
    : await prisma.modelVersion.findFirst({ where: { modelId: m.id, status: 'PUBLISHED' } });
  if (!v) throw new ValidationError(o.version ? `Model ${m.slug} has no version ${o.version}` : `Model ${m.slug} has no published version`);
  // a pinned version must have been published (it may since have been retired by a newer one)
  if (o.version && !['PUBLISHED', 'RETIRED'].includes(v.status)) throw new ValidationError(`Model ${m.slug} version ${o.version} is ${v.status.toLowerCase()}, not published`);
  let r = await ml<any>('/predict', { versionId: v.id, rows }, 60_000);
  if (r.status === 409) r = await ml<any>('/predict', { versionId: v.id, rows, artifact: Buffer.from(v.artifact as any).toString('base64') }, 60_000);
  return { model: m.slug, version: v.version, results: r.data.results };
}

export async function tryPredict(versionId: string, rows: any[], user: AuthUser) {
  const v = await prisma.modelVersion.findUnique({ where: { id: versionId }, include: { model: true } });
  if (!v) throw new NotFoundError('Model version');
  await assertProjectAccess(v.model.projectId, user);
  return predict(v.model.projectId, v.model.id, rows, { versionId });
}

/** Printable evaluation report (browser → Save as PDF). */
export async function reportHtml(versionId: string, user: AuthUser) {
  const v = await getVersion(versionId, user);
  const r: any = v.report || {}; const c: any = v.config;
  const esc = (x: any) => String(x ?? '').replace(/[&<>]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[s]);
  const num = (x: any) => (typeof x === 'number' ? (Math.abs(x) >= 1000 ? x.toLocaleString('en-US', { maximumFractionDigits: 0 }) : x.toFixed(4)) : esc(x));
  const rows = (o: any) => Object.entries(o || {}).map(([k, x]) => `<tr><th>${esc(k)}</th><td>${num(x)}</td></tr>`).join('');
  const conf = r.confusion ? `<h2>Confusion matrix</h2><table><tr><th>actual \\ predicted</th>${r.confusion.labels.map((l: any) => `<th>${esc(l)}</th>`).join('')}</tr>${r.confusion.matrix.map((row: any[], i: number) => `<tr><th>${esc(r.confusion.labels[i])}</th>${row.map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}</table>` : '';
  const imp = r.importance?.length ? `<h2>Feature importance</h2><table>${r.importance.map((f: any) => `<tr><th>${esc(f.feature)}</th><td>${(f.score * 100).toFixed(1)}%</td></tr>`).join('')}</table>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(v.model.name)} v${v.version} — evaluation</title>
<style>body{font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#161616;max-width:860px;margin:32px auto;padding:0 16px}h1{font-size:24px;font-weight:400}h2{font-size:16px;margin-top:28px}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #e0e0e0;padding:6px 8px;text-align:left}th{font-weight:600;background:#f4f4f4}.muted{color:#525252}</style></head><body>
<h1>${esc(v.model.name)} · version ${v.version}</h1>
<p class="muted">Status ${esc(v.status)} · trained ${esc(v.trainedAt)} · ${esc(r.rows)} rows (${r.split ? `${r.split.train} train / ${r.split.test} test` : 'all rows'})</p>
<h2>Setup</h2><table>${rows({ 'Data Set': c.dataset, Algorithm: c.algorithm, Task: r.task, Target: c.target ?? '—', Features: (c.features || []).join(', '), Scaling: c.scaler, ...Object.fromEntries(Object.entries(r.params || {}).map(([k, x]) => [`param ${k}`, x])) })}</table>
${r.search ? `<h2>Parameter search</h2><table>${rows({ Type: r.search.type, Tried: r.search.tried, 'Best CV score': r.search.bestScore, ...Object.fromEntries(Object.entries(r.search.best).map(([k, x]) => [`best ${k}`, x])) })}</table>` : ''}
<h2>Metrics</h2><table>${rows(r.metrics)}</table>${conf}${imp}
${r.clusters ? `<h2>Clusters</h2><table>${r.clusters.map((k: any) => `<tr><th>cluster ${k.cluster}</th><td>${k.size} rows</td></tr>`).join('')}</table>` : ''}
</body></html>`;
}

/** Create (or add a snapshot to) a Data Set from an uploaded Excel/CSV file — training data for models. */
export async function uploadDataset(body: { projectId: string; name: string; fileName: string; contentBase64: string; keyFields?: string[]; sheet?: string }, user: AuthUser) {
  if (!body.name?.trim()) throw new ValidationError('Name the Data Set');
  if (!body.contentBase64) throw new ValidationError('Choose a file');
  const p = await assertProjectAccess(body.projectId, user, 'write');
  const { readSheet } = await import('../data/files.js');
  const rows = await readSheet(Buffer.from(body.contentBase64, 'base64'), body.fileName || 'file.xlsx', body.sheet, 1);
  if (!rows.length) throw new ValidationError('The file has no data rows');
  const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `dataset-${Date.now()}`;
  const keyFields = (body.keyFields || []).filter(k => k in rows[0]);
  const ds = await prisma.dataset.upsert({ where: { projectId_slug: { projectId: p.id, slug } }, update: {},
    create: { projectId: p.id, slug, name: body.name.trim(), format: 'snapshot', keyFields } });
  const snap = await writeSnapshot(ds.id, null, rows, ds.keyFields, ds.piiFields, { uploaded: { file: body.fileName, by: user.email, at: new Date().toISOString() } }, 0);
  await activate(ds.id, snap.id);
  await prisma.dataset.update({ where: { id: ds.id }, data: { rowCount: rows.length } }).catch(() => {});
  return { id: ds.id, slug: ds.slug, rows: rows.length, columns: Object.keys(rows[0]) };
}

// ---------------------------------------------------------------- SQL source
// A Data Set can be filled from a read-only SQL query on a Connection (Oracle / Postgres).
// The query is checked by the connector guard (one SELECT / WITH statement, no write keywords,
// allowed objects), runs inside a read-only transaction where the driver supports it, and is
// capped by rows and time. Each run writes a new snapshot; the query is kept on the Data Set
// (schema.source) so "Refresh" can run it again. Credentials stay encrypted on the Connection.
const SQL_MAX_ROWS = Number(process.env.XRULES_SQL_MAX_ROWS || MAX_ROWS);
const SQL_TIMEOUT_MS = Number(process.env.XRULES_SQL_TIMEOUT_MS || 60_000);

type SqlSource = { connectionId: string; sql: string; limit?: number; timeoutSec?: number };

async function runSqlSource(src: SqlSource, user: AuthUser, previewRows?: number) {
  if (!src.connectionId) throw new ValidationError('Choose a connection');
  if (!src.sql?.trim()) throw new ValidationError('Write a SELECT query');
  const { resolveForUser } = await import('../services/connections.service.js');
  const { connection, rc } = await resolveForUser(src.connectionId, user, 'write');
  if (!['oracle', 'postgres'].includes(rc.type)) throw new ValidationError(`SQL is not supported for ${String(connection.type).toLowerCase()} connections`);
  const { query, assertReadOnlySql } = await import('../data/connectors.js');
  try { assertReadOnlySql(src.sql, rc.allowedObjects); } catch (e: any) { throw new ValidationError(e.message); }
  const limit = Math.min(Math.max(1, Number(src.limit) || SQL_MAX_ROWS), SQL_MAX_ROWS);
  const timeoutMs = Math.min(Math.max(1, Number(src.timeoutSec) || SQL_TIMEOUT_MS / 1000) * 1000, SQL_TIMEOUT_MS);
  const t0 = Date.now();
  const rows = await query(rc, src.sql, [], previewRows ? Math.min(previewRows, limit) : limit, timeoutMs)
    .catch((e: any) => { throw new ValidationError(`Query failed: ${String(e?.message || e).slice(0, 500)}`); });
  return { connection, rows, limit, timeoutMs, ms: Date.now() - t0 };
}

/** preview=true returns the first 50 rows only; otherwise creates the Data Set (or adds a snapshot) from the query. */
export async function queryDataset(body: { projectId: string; name?: string; datasetId?: string; connectionId: string; sql: string; limit?: number; timeoutSec?: number; keyFields?: string[]; preview?: boolean }, user: AuthUser) {
  const src: SqlSource = { connectionId: body.connectionId, sql: String(body.sql || '').trim().replace(/;+\s*$/, ''), limit: body.limit, timeoutSec: body.timeoutSec };
  if (body.preview) {
    const r = await runSqlSource(src, user, 50);
    return { rows: r.rows, columns: r.rows[0] ? Object.keys(r.rows[0]) : [], ms: r.ms };
  }
  let ds: any;
  if (body.datasetId) {
    ds = await prisma.dataset.findUnique({ where: { id: body.datasetId } });
    if (!ds) throw new NotFoundError('Data Set');
    await assertProjectAccess(ds.projectId, user, 'write');
  } else if (!body.name?.trim()) throw new ValidationError('Name the Data Set');
  const r = await runSqlSource(src, user);
  if (!r.rows.length) throw new ValidationError('The query returned no rows');
  if (!ds) {
    const p = await assertProjectAccess(body.projectId, user, 'write');
    const slug = body.name!.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `dataset-${Date.now()}`;
    const keyFields = (body.keyFields || []).filter(k => k in r.rows[0]);
    ds = await prisma.dataset.upsert({ where: { projectId_slug: { projectId: p.id, slug } }, update: {},
      create: { projectId: p.id, slug, name: body.name!.trim(), format: 'snapshot', keyFields } });
  }
  const source = { kind: 'sql', connectionId: r.connection.id, connection: r.connection.slug, sql: src.sql, limit: r.limit, timeoutSec: r.timeoutMs / 1000 };
  const snap = await writeSnapshot(ds.id, null, r.rows, ds.keyFields, ds.piiFields,
    { query: { connection: r.connection.slug, rows: r.rows.length, truncated: r.rows.length >= r.limit, ms: r.ms, by: user.email, at: new Date().toISOString() } }, 0);
  await activate(ds.id, snap.id);
  await prisma.dataset.update({ where: { id: ds.id }, data: { rowCount: r.rows.length, uri: `connection:${r.connection.slug}`, schema: { ...((ds.schema as any) || {}), source } } }).catch(() => {});
  return { id: ds.id, slug: ds.slug, snapshotId: snap.id, rows: r.rows.length, truncated: r.rows.length >= r.limit, columns: Object.keys(r.rows[0]), ms: r.ms };
}

/** Run the Data Set's saved query again → new active snapshot (the previous one is kept). */
export async function refreshDataset(datasetId: string, user: AuthUser) {
  const ds = await prisma.dataset.findUnique({ where: { id: datasetId } });
  if (!ds) throw new NotFoundError('Data Set');
  const s: any = (ds.schema as any)?.source;
  if (s?.kind !== 'sql') throw new ValidationError('This Data Set has no saved query');
  return queryDataset({ projectId: ds.projectId, datasetId: ds.id, connectionId: s.connectionId, sql: s.sql, limit: s.limit, timeoutSec: s.timeoutSec }, user);
}
