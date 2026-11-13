// Data Layer API used by the Studio:
//   POST /data/connections/:id/test           test + read-only verification (?env=PROD)
//   POST /data/flows/:id/run                  run a Data Flow now
//   POST /data/flows/:id/preview              run on the first 100 rows without writing
//   GET  /data/flows/:id/next-run             next scheduled time
//   POST /data/events                         { projectId, event } → run flows listening for it
//   GET  /data/datasets/:id/snapshots         snapshots (newest first)
//   POST /data/datasets/:id/snapshots/:sid/activate
//   GET  /data/datasets/:id/snapshots/:sid/rows?limit=
//   GET  /data/datasets/:id/lookup?key=a|b    lookup in the active snapshot
//   GET  /data/datasets/:id/used-by           rules and flows that read this Data Set
//   CRUD /data/file-templates
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../config/database.js';
import { assertProjectAccess } from '../services/_access.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { testConnection } from '../services/connections.service.js';
import { runDataFlow, emitEvent } from '../data/dataflow.service.js';
import * as ds from '../data/datasets-runtime.js';
import { nextRun } from '../data/cron.js';

const r = Router();
const ok = (res: any, data: any, status = 200) => res.status(status).json({ success: true, data });

async function flowFor(id: string, user: any, perm: 'read' | 'write' = 'write') {
  const f = await prisma.flow.findUnique({ where: { id } });
  if (!f) throw new NotFoundError('Flow');
  await assertProjectAccess(f.projectId, user, perm);
  return f;
}
async function datasetFor(id: string, user: any, perm: 'read' | 'write' = 'read') {
  const d = await prisma.dataset.findUnique({ where: { id } });
  if (!d) throw new NotFoundError('Dataset');
  await assertProjectAccess(d.projectId, user, perm);
  return d;
}

r.post('/connections/:id/test', authMiddleware, async (req, res, next) => {
  try { ok(res, await testConnection(req.params.id, req.user!, (req.query.env as string) || req.body?.env)); } catch (e) { next(e); }
});

r.get('/flows', authMiddleware, async (req, res, next) => {
  try {
    const p = await assertProjectAccess(String(req.query.project_id), req.user!);
    const flows = await prisma.flow.findMany({ where: { projectId: p.id, kind: 'DATA' }, orderBy: { name: 'asc' } });
    const out = await Promise.all(flows.map(async f => {
      const g: any = f.graph || {}; const ns: any[] = g.nodes || [];
      const src = ns.find(n => (n.type || n.data?.kind) === 'source')?.data || {};
      const wr = ns.find(n => (n.type || n.data?.kind) === 'write')?.data || {};
      const last = await prisma.job.findFirst({ where: { flowId: f.id }, orderBy: { createdAt: 'desc' } });
      const s: any = f.schedule || {};
      return {
        id: f.id, name: f.name, slug: f.slug, status: f.status.toLowerCase(), version: f.version,
        source: src.connection || (src.file ? 'file' : null), target: wr.dataset || null,
        schedule: s, nextRunAt: s.cron && s.enabled !== false && f.status === 'PUBLISHED' ? nextRun(s.cron)?.toISOString() ?? null : null,
        lastRun: last ? { id: last.id, state: last.state, error: last.error, at: (last.finishedAt || last.createdAt).toISOString(),
          ms: last.startedAt && last.finishedAt ? last.finishedAt.getTime() - last.startedAt.getTime() : null,
          rows: (last.output as any)?.rowCount ?? null, rejected: (last.output as any)?.rejectedCount ?? null } : null,
      };
    }));
    ok(res, out);
  } catch (e) { next(e); }
});

r.get('/datasets', authMiddleware, async (req, res, next) => {
  try {
    const p = await assertProjectAccess(String(req.query.project_id), req.user!);
    const sets = await prisma.dataset.findMany({ where: { projectId: p.id }, orderBy: { slug: 'asc' } });
    const out = await Promise.all(sets.map(async d => {
      const latest = await prisma.datasetSnapshot.findFirst({ where: { datasetId: d.id }, orderBy: { createdAt: 'desc' } });
      const active = d.activeSnapshotId ? await prisma.datasetSnapshot.findUnique({ where: { id: d.activeSnapshotId } }) : null;
      return { id: d.id, slug: d.slug, name: d.name, keyFields: d.keyFields, rowCount: d.rowCount, format: d.format,
        active: active ? { id: active.id, at: active.createdAt.toISOString() } : null,
        latest: latest ? { id: latest.id, status: latest.status, at: latest.createdAt.toISOString() } : null,
        stale: !!latest && !!active && latest.id !== active.id && latest.status === 'REJECTED' };
    }));
    ok(res, out);
  } catch (e) { next(e); }
});

r.get('/datasets/:id', authMiddleware, async (req, res, next) => {
  try { ok(res, await datasetFor(req.params.id, req.user!)); } catch (e) { next(e); }
});

r.get('/executions/:id', authMiddleware, async (req, res, next) => {
  try {
    const e = await prisma.execution.findUnique({ where: { id: req.params.id }, include: { flow: true, rule: true } });
    if (!e) throw new NotFoundError('Execution');
    await assertProjectAccess((e.flow || e.rule)!.projectId, req.user!);
    ok(res, { ...e, createdAt: e.createdAt.toISOString(), name: e.flow?.name || e.rule?.name, slug: e.flow?.slug || e.rule?.slug });
  } catch (err) { next(err); }
});

r.get('/flow-executions', authMiddleware, async (req, res, next) => {
  try {
    const p = await assertProjectAccess(String(req.query.project_id), req.user!);
    const rows = await prisma.execution.findMany({ where: { flow: { projectId: p.id } }, include: { flow: { select: { name: true, slug: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
    ok(res, rows.map(e => ({ id: e.id, flow: e.flow?.name, slug: e.flow?.slug, version: e.flowVersion, at: e.createdAt.toISOString(), ms: e.duration,
      summary: (e.output as any)?.summary || null, passed: (e.output as any)?.passed ?? null, environment: e.environment })));
  } catch (err) { next(err); }
});

r.post('/flows/:id/run', authMiddleware, async (req, res, next) => {
  try { const f = await flowFor(req.params.id, req.user!); ok(res, await runDataFlow(f.id, { trigger: `manual:${req.user!.email}` })); } catch (e) { next(e); }
});

r.post('/flows/:id/preview', authMiddleware, async (req, res, next) => {
  try { const f = await flowFor(req.params.id, req.user!, 'read'); ok(res, await runDataFlow(f.id, { preview: true, limit: Math.min(Number(req.body?.limit) || 100, 1000) })); } catch (e) { next(e); }
});

r.get('/flows/:id/next-run', authMiddleware, async (req, res, next) => {
  try {
    const f = await flowFor(req.params.id, req.user!, 'read');
    const cron = (f.schedule as any)?.cron;
    ok(res, { cron: cron || null, nextRunAt: cron && (f.schedule as any)?.enabled !== false ? nextRun(cron)?.toISOString() ?? null : null });
  } catch (e) { next(e); }
});

r.post('/events', authMiddleware, async (req, res, next) => {
  try {
    const { projectId, event } = req.body || {};
    if (!projectId || !event) throw new ValidationError('projectId and event required');
    const p = await assertProjectAccess(projectId, req.user!, 'write');
    ok(res, await emitEvent(p.id, String(event)));
  } catch (e) { next(e); }
});

r.get('/datasets/:id/snapshots', authMiddleware, async (req, res, next) => {
  try { const d = await datasetFor(req.params.id, req.user!); ok(res, { dataset: d, snapshots: await ds.listSnapshots(d.id) }); } catch (e) { next(e); }
});

r.post('/datasets/:id/snapshots/:sid/activate', authMiddleware, async (req, res, next) => {
  try { const d = await datasetFor(req.params.id, req.user!, 'write'); await ds.activate(d.id, req.params.sid); ok(res, await ds.listSnapshots(d.id)); } catch (e) { next(e); }
});

r.get('/datasets/:id/snapshots/:sid/rows', authMiddleware, async (req, res, next) => {
  try { await datasetFor(req.params.id, req.user!); ok(res, await ds.previewRows(req.params.sid, Math.min(Number(req.query.limit) || 100, 1000))); } catch (e) { next(e); }
});

r.get('/datasets/:id/lookup', authMiddleware, async (req, res, next) => {
  try { const d = await datasetFor(req.params.id, req.user!); ok(res, await ds.lookup(d.projectId, d.slug, String(req.query.key ?? ''))); } catch (e) { next(e); }
});

r.get('/datasets/:id/used-by', authMiddleware, async (req, res, next) => {
  try {
    const d = await datasetFor(req.params.id, req.user!);
    const needle = `"${d.slug}"`;
    const flows = await prisma.flow.findMany({ where: { projectId: d.projectId }, select: { id: true, slug: true, name: true, kind: true, graph: true } });
    const rules = await prisma.rule.findMany({ where: { projectId: d.projectId }, select: { id: true, slug: true, name: true, definition: true } });
    ok(res, [
      ...flows.filter(f => JSON.stringify(f.graph).includes(needle)).map(f => ({ type: f.kind === 'DATA' ? 'data_flow' : 'decision_flow', id: f.id, slug: f.slug, name: f.name })),
      ...rules.filter(x => JSON.stringify(x.definition).includes(needle)).map(x => ({ type: 'rule', id: x.id, slug: x.slug, name: x.name })),
    ]);
  } catch (e) { next(e); }
});

// ---- file templates
r.get('/file-templates', authMiddleware, async (req, res, next) => {
  try { const p = await assertProjectAccess(String(req.query.project_id), req.user!); ok(res, await prisma.fileTemplate.findMany({ where: { projectId: p.id }, orderBy: { code: 'asc' } })); } catch (e) { next(e); }
});
r.post('/file-templates', authMiddleware, async (req, res, next) => {
  try {
    const { projectId, code, name, spec } = req.body || {};
    if (!projectId || !code || !spec?.sheets) throw new ValidationError('projectId, code and spec.sheets required');
    const p = await assertProjectAccess(projectId, req.user!, 'write');
    ok(res, await prisma.fileTemplate.create({ data: { projectId: p.id, code, name: name || code, spec } }), 201);
  } catch (e) { next(e); }
});
r.put('/file-templates/:id', authMiddleware, async (req, res, next) => {
  try {
    const t = await prisma.fileTemplate.findUnique({ where: { id: req.params.id } });
    if (!t) throw new NotFoundError('File template');
    await assertProjectAccess(t.projectId, req.user!, 'write');
    const { name, spec } = req.body || {};
    ok(res, await prisma.fileTemplate.update({ where: { id: t.id }, data: { ...(name ? { name } : {}), ...(spec ? { spec, version: t.version + 1 } : {}) } }));
  } catch (e) { next(e); }
});
r.delete('/file-templates/:id', authMiddleware, async (req, res, next) => {
  try {
    const t = await prisma.fileTemplate.findUnique({ where: { id: req.params.id } });
    if (!t) throw new NotFoundError('File template');
    await assertProjectAccess(t.projectId, req.user!, 'write');
    await prisma.fileTemplate.delete({ where: { id: t.id } }); ok(res, null);
  } catch (e) { next(e); }
});

export default r;
