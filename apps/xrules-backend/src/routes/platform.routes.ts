// Studio API for the platform foundation: API Specs, reviews, executions/trace.
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as specs from '../services/apispecs.service.js';
import * as gov from '../services/governance.service.js';
import { invalidateRoutes } from './gateway.routes.js';
import { prisma } from '../config/database.js';
import { assertProjectAccess } from '../services/_access.js';
import { NotFoundError } from '../utils/errors.js';

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

export default r;
