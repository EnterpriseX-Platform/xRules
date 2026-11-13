// Studio API for the platform foundation: API Specs, reviews, executions/trace.
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as specs from '../services/apispecs.service.js';
import * as gov from '../services/governance.service.js';
import { invalidateRoutes } from './gateway.routes.js';
import { prisma } from '../config/database.js';
import { assertProjectAccess } from '../services/_access.js';
import { NotFoundError } from '../utils/errors.js';
import * as bulk from '../platform/bulk.js';
import { runTrigger, triggerConfig } from '../platform/triggers.js';
import { enqueue } from '../platform/queue.js';

const r = Router();
const ok = (res: any, data: any, status = 200) => res.status(status).json({ success: true, data });
const h = (fn: (req: any) => Promise<any>, status = 200) => async (req: any, res: any, next: any) => { try { ok(res, await fn(req), status); } catch (e) { next(e); } };

// ---- API Specs
r.get('/specs', authMiddleware, h(req => specs.list(String(req.query.project_id), req.user)));
r.post('/specs', authMiddleware, h(req => specs.create(req.body, req.user), 201));
r.get('/specs/:id', authMiddleware, h(req => specs.get(req.params.id, req.user)));
r.put('/specs/:id', authMiddleware, h(req => specs.update(req.params.id, req.body, req.user)));
r.delete('/specs/:id', authMiddleware, h(async req => { await specs.remove(req.params.id, req.user); invalidateRoutes(); return null; }));
r.post('/specs/:id/publish', authMiddleware, h(async req => { const s = await specs.publish(req.params.id, req.user, req.body?.message); invalidateRoutes(); return s; }));
r.get('/specs/:id/openapi.json', authMiddleware, async (req, res, next) => { try { res.json(await specs.openapi(req.params.id)); } catch (e) { next(e); } });
r.post('/specs/:id/operations', authMiddleware, h(req => specs.addOperation(req.params.id, req.body, req.user), 201));
r.put('/operations/:opId', authMiddleware, h(req => specs.updateOperation(req.params.opId, req.body, req.user)));
r.delete('/operations/:opId', authMiddleware, h(async req => { await specs.removeOperation(req.params.opId, req.user); invalidateRoutes(); return null; }));
r.post('/operations/:opId/try', authMiddleware, h(req => specs.tryOperation(req.params.opId, req.body || {}, req.user)));

// ---- Reviews
r.get('/reviews', authMiddleware, h(req => gov.list(String(req.query.project_id), req.user, req.query.status as string | undefined)));
r.post('/reviews', authMiddleware, h(req => gov.submit(req.body, req.user), 201));
r.post('/reviews/:id/approve', authMiddleware, h(req => gov.decide(req.params.id, 'APPROVED', req.body?.note, req.user)));
r.post('/reviews/:id/reject', authMiddleware, h(req => gov.decide(req.params.id, 'REJECTED', req.body?.note, req.user)));

// ---- Execution + Rule Trace
r.get('/executions/:id/trace', authMiddleware, h(async req => {
  const e = await prisma.execution.findUnique({ where: { id: req.params.id }, include: { flow: true, rule: true } });
  if (!e) throw new NotFoundError('Execution');
  await assertProjectAccess((e.flow || e.rule)!.projectId, req.user);
  return { id: e.id, full: e.traceFull, trace: e.trace, findings: e.findings, lineage: e.lineage, ms: e.duration, status: e.status, error: e.error, targetType: e.targetType, requestId: e.requestId };
}));

// ---- Bulk Runs
r.get('/bulk', authMiddleware, h(req => bulk.list(String(req.query.project_id), req.user)));
r.post('/bulk', authMiddleware, h(req => bulk.createBulkRun(req.body, req.user), 201));
r.get('/bulk/:id', authMiddleware, h(req => bulk.get(req.params.id, req.user)));
r.post('/bulk/:id/:action(pause|resume|cancel|retry_errors)', authMiddleware, h(req => bulk.setStatus(req.params.id, req.params.action, req.user)));
r.get('/bulk/:id/rows', authMiddleware, h(req => bulk.rows(req.params.id, req.user, { status: req.query.status, offset: Number(req.query.offset) || 0, limit: Number(req.query.limit) || 100 })));
r.get('/bulk/:id/compare/:other', authMiddleware, h(req => bulk.compare(req.params.id, req.params.other, req.user)));
r.get('/bulk/:id/results.csv', authMiddleware, async (req: any, res, next) => {
  try {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bulk-${req.params.id}.csv"`);
    for await (const chunk of bulk.resultsCsv(req.params.id, req.user)) res.write(chunk);
    res.end();
  } catch (e) { next(e); }
});

// ---- Simulations
r.post('/simulations/backtest', authMiddleware, h(req => bulk.backtest(req.body, req.user), 201));
r.put('/flows/:id/challenger', authMiddleware, h(async req => {
  const f = await prisma.flow.findUnique({ where: { id: req.params.id } }); if (!f) throw new NotFoundError('Flow');
  await assertProjectAccess(f.projectId, req.user, 'write');
  const b = req.body || {};
  const challenger = b.off ? null : { draft: b.version ? false : true, version: b.version, sampleRate: Math.min(Math.max(Number(b.sampleRate ?? 0.1), 0), 1), until: b.until || null, startedAt: new Date().toISOString(), by: req.user.email };
  await prisma.flow.update({ where: { id: f.id }, data: { challenger: challenger as any } });
  return { challenger };
}));
r.get('/flows/:id/challenger', authMiddleware, h(async req => {
  const f = await prisma.flow.findUnique({ where: { id: req.params.id } }); if (!f) throw new NotFoundError('Flow');
  await assertProjectAccess(f.projectId, req.user);
  const { challengerSummary } = await import('../platform/runner.js');
  return { challenger: f.challenger, summary: await challengerSummary(f.id) };
}));

// ---- Tests (every target)
r.get('/tests', authMiddleware, h(async req => (await import('../platform/testing.js')).listCases(String(req.query.project_id), req.user, { targetType: req.query.targetType, targetId: req.query.targetId, suiteId: req.query.suiteId })));
r.post('/tests', authMiddleware, h(async req => (await import('../platform/testing.js')).createCase(req.body, req.user), 201));
r.put('/tests/:id', authMiddleware, h(async req => (await import('../platform/testing.js')).updateCase(req.params.id, req.body, req.user)));
r.post('/tests/:id/run', authMiddleware, h(async req => (await import('../platform/testing.js')).runCase(req.params.id)));
r.post('/tests/target/:type/:id/run', authMiddleware, h(async req => (await import('../platform/testing.js')).runForTarget(req.params.type, req.params.id)));
r.post('/suites/:id/run', authMiddleware, h(async req => (await import('../platform/testing.js')).runSuite(req.params.id, req.user)));

// ---- Vocabulary + Rule Cowork
r.get('/vocabulary', authMiddleware, h(async req => (await import('../platform/vocabulary.js')).listTerms(String(req.query.project_id), req.user)));
r.get('/vocabulary/suggest', authMiddleware, h(async req => (await import('../platform/vocabulary.js')).suggest(String(req.query.project_id), req.user)));
r.post('/vocabulary', authMiddleware, h(async req => (await import('../platform/vocabulary.js')).upsertTerm(req.body, req.user), 201));
r.delete('/vocabulary/:id', authMiddleware, h(async req => { await (await import('../platform/vocabulary.js')).deleteTerm(req.params.id, req.user); return null; }));
r.post('/vocabulary/check', authMiddleware, h(async req => (await import('../platform/vocabulary.js')).check(req.body.projectId, req.body.sentence, req.user)));
r.post('/vocabulary/rules', authMiddleware, h(async req => (await import('../platform/vocabulary.js')).saveRule(req.body, req.user), 201));
r.post('/cowork/draft', authMiddleware, h(async req => (await import('../platform/cowork.js')).draft(req.body, req.user)));
r.post('/cowork/apply', authMiddleware, h(async req => (await import('../platform/cowork.js')).apply(req.body, req.user), 201));

// ---- Monitor
r.get('/monitor/overview', authMiddleware, h(async req => (await import('../platform/monitor.js')).overview(String(req.query.project_id), req.user)));
r.get('/monitor/traffic', authMiddleware, h(async req => (await import('../platform/monitor.js')).traffic(String(req.query.project_id), req.user, Number(req.query.hours) || 24)));
r.get('/monitor/decisions', authMiddleware, h(async req => (await import('../platform/monitor.js')).decisions(String(req.query.project_id), req.user, Number(req.query.hours) || 168)));
r.get('/monitor/data-health', authMiddleware, h(async req => (await import('../platform/monitor.js')).dataHealth(String(req.query.project_id), req.user)));
r.get('/alerts', authMiddleware, h(async req => {
  const p = await assertProjectAccess(String(req.query.project_id), req.user);
  const m = await import('../platform/monitor.js'); await m.ensureDefaultAlerts(p.id);
  return { rules: await prisma.alertRule.findMany({ where: { projectId: p.id }, orderBy: { createdAt: 'asc' } }),
    events: await prisma.alertEvent.findMany({ where: { rule: { projectId: p.id } }, include: { rule: { select: { name: true } } }, orderBy: { startedAt: 'desc' }, take: 100 }) };
}));
r.put('/alerts/:id', authMiddleware, h(async req => {
  const a = await prisma.alertRule.findUnique({ where: { id: req.params.id } }); if (!a) throw new NotFoundError('Alert');
  await assertProjectAccess(a.projectId, req.user, 'write');
  const u: any = {}; for (const k of ['threshold', 'windowMin', 'enabled', 'channels', 'name']) if (req.body[k] !== undefined) u[k] = req.body[k];
  return prisma.alertRule.update({ where: { id: a.id }, data: u });
}));
r.post('/alerts/events/:id/ack', authMiddleware, h(async req => prisma.alertEvent.update({ where: { id: req.params.id }, data: { ackBy: req.user.email } })));
r.post('/alerts/evaluate', authMiddleware, h(async () => (await import('../platform/queue.js')).enqueue('alerts.evaluate', {})));

// ---- Triggers
r.get('/triggers', authMiddleware, h(async req => {
  const p = await assertProjectAccess(String(req.query.project_id), req.user);
  const flows = await prisma.flow.findMany({ where: { projectId: p.id, kind: { in: ['TRIGGER', 'DATA'] } }, orderBy: { name: 'asc' } });
  return Promise.all(flows.map(async f => {
    const last = await prisma.execution.findFirst({ where: { flowId: f.id }, orderBy: { createdAt: 'desc' }, select: { status: true, createdAt: true, duration: true, error: true } });
    const job = await prisma.job.findFirst({ where: { flowId: f.id }, orderBy: { createdAt: 'desc' }, select: { state: true, createdAt: true, error: true } });
    const c: any = triggerConfig(f);
    return { id: f.id, name: f.name, slug: f.slug, kind: f.kind.toLowerCase(), status: f.status.toLowerCase(), version: f.version,
      type: f.kind === 'DATA' ? 'data_sync' : (c.type || 'manual'), cron: c.cron || null, enabled: c.enabled !== false, lastRunAt: f.lastRunAt?.toISOString() ?? null,
      last: last ? { ok: last.status === 'SUCCESS', at: last.createdAt.toISOString(), ms: last.duration, error: last.error } : job ? { ok: job.state === 'COMPLETED', at: job.createdAt.toISOString(), error: job.error } : null,
      webhookPath: c.type === 'webhook' ? `/hooks/${f.slug}` : null };
  }));
}));
r.post('/triggers/:id/run', authMiddleware, h(async req => {
  const f = await prisma.flow.findUnique({ where: { id: req.params.id } });
  if (!f) throw new NotFoundError('Trigger');
  await assertProjectAccess(f.projectId, req.user, 'write');
  const job = await enqueue('trigger.run', { flowId: f.id, reason: `manual:${req.user.email}`, payload: req.body || {} });
  return { queued: true, jobId: job.id };
}));
r.post('/triggers/:id/run-now', authMiddleware, h(async req => {
  const f = await prisma.flow.findUnique({ where: { id: req.params.id } });
  if (!f) throw new NotFoundError('Trigger');
  await assertProjectAccess(f.projectId, req.user, 'write');
  return runTrigger(f.id, `manual:${req.user.email}`, req.body || {});
}));

export default r;
