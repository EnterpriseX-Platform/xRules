import { Router, Request, Response, NextFunction } from 'express';
import * as svc from '../services/flows.service.js';
import { authMiddleware } from '../middleware/auth.js';

const r = Router();

r.get('/', authMiddleware, async (req, res, next) => {
  try {
    const projectId = req.query.project_id as string;
    if (!projectId) { res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'project_id required' } }); return; }
    const { listAcross } = await import('../platform/scope.js');
    res.json({ success: true, data: await listAcross(projectId, req.user!, id => svc.listFlows(id, req.user!, req.query.status as string, req.query.kind as string) as any) });
  } catch (e) { next(e); }
});

r.get('/:id/uses', authMiddleware, async (req, res, next) => {
  try { const { flowUses } = await import('../platform/scope.js'); res.json({ success: true, data: await flowUses(req.params.id) }); } catch (e) { next(e); }
});
r.get('/:id/used-by', authMiddleware, async (req, res, next) => {
  try { const { usedBy } = await import('../platform/scope.js'); res.json({ success: true, data: await usedBy('flow', req.params.id) }); } catch (e) { next(e); }
});

r.get('/:id', authMiddleware, async (req, res, next) => {
  try { res.json({ success: true, data: await svc.getFlow(req.params.id, req.user!) }); } catch (e) { next(e); }
});

r.post('/', authMiddleware, async (req, res, next) => {
  try { res.status(201).json({ success: true, data: await svc.createFlow(req.body, req.user!) }); } catch (e) { next(e); }
});

r.put('/:id', authMiddleware, async (req, res, next) => {
  try { res.json({ success: true, data: await svc.updateFlow(req.params.id, req.body, req.user!) }); } catch (e) { next(e); }
});

r.delete('/:id', authMiddleware, async (req, res, next) => {
  try { await svc.deleteFlow(req.params.id, req.user!); res.json({ success: true }); } catch (e) { next(e); }
});

r.post('/:id/archive', authMiddleware, async (req, res, next) => {
  try { const { archiveFlow } = await import('../services/flows.service.js'); res.json({ success: true, data: await archiveFlow(req.params.id, req.user!) }); } catch (e) { next(e); }
});

r.post('/:id/publish', authMiddleware, async (req, res, next) => {
  try { res.json({ success: true, data: await svc.publishFlow(req.params.id, req.body?.message, req.user!) }); } catch (e) { next(e); }
});

// Try the flow as it is on screen (draft graph from the body, or the saved one) without publishing or an API key.
r.post('/:id/run', authMiddleware, async (req, res, next) => {
  try {
    const flow: any = await svc.getFlow(req.params.id, req.user!);
    const graph = req.body?.graph || flow.graph;
    const input = req.body?.input ?? {};
    const { runFlow } = await import('../services/flow-runtime.service.js');
    const { executeRule } = await import('../services/execute.service.js');
    const { prisma } = await import('../config/database.js');
    const wsId = flow.project?.workspaceId;
    const trace: any[] = [];
    const t0 = Date.now();
    try {
      const output = await runFlow(graph, input, async (slug: string, payload: any) => {
        const rule = /^[a-z0-9]{20,30}$/i.test(slug)
          ? await prisma.rule.findUnique({ where: { id: slug } })
          : await prisma.rule.findFirst({ where: { OR: [{ slug }, { alias: slug }], ...(wsId ? { project: { workspaceId: wsId } } : {}) } });
        if (!rule) throw new Error(`Step uses a rule that does not exist: '${slug}'`);
        return ((await executeRule(rule.id, payload, {}, req.user!)) as any).output;
      }, { projectId: flow.projectId, trace });
      res.json({ success: true, data: { output, trace, duration_ms: Date.now() - t0 } });
    } catch (e: any) {
      res.json({ success: true, data: { error: e?.message || String(e), trace, duration_ms: Date.now() - t0 } });
    }
  } catch (e) { next(e); }
});

export default r;
