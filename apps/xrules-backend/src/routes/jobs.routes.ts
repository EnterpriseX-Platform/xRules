import { Router } from 'express';
import * as svc from '../services/jobs.service.js';
import { authMiddleware } from '../middleware/auth.js';

const r = Router();

r.get('/', authMiddleware, async (req, res, next) => {
  try {
    const projectId = req.query.project_id as string;
    if (!projectId) { res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'project_id required' } }); return; }
    res.json({ success: true, data: await svc.list(projectId, req.user!, req.query.state as string) });
  } catch (e) { next(e); }
});

r.post('/start/:flowId', authMiddleware, async (req, res, next) => {
  try {
    const version = req.body.version ? Number(req.body.version) : undefined;
    res.status(201).json({ success: true, data: await svc.start(req.params.flowId, version, req.body.input, req.body.correlationId, req.user!) });
  } catch (e) { next(e); }
});

r.post('/start/:flowId/:version', authMiddleware, async (req, res, next) => {
  try {
    res.status(201).json({ success: true, data: await svc.start(req.params.flowId, Number(req.params.version), req.body.input, req.body.correlationId, req.user!) });
  } catch (e) { next(e); }
});

r.get('/:id', authMiddleware, async (req, res, next) => {
  try { res.json({ success: true, data: await svc.get(req.params.id, req.user!) }); } catch (e) { next(e); }
});

r.post('/cancel/:id', authMiddleware, async (req, res, next) => {
  try { res.json({ success: true, data: await svc.cancel(req.params.id, req.user!) }); } catch (e) { next(e); }
});

r.post('/cancelAll/space/:projectId', authMiddleware, async (req, res, next) => {
  try { res.json({ success: true, data: await svc.cancelAllInSpace(req.params.projectId, req.user!) }); } catch (e) { next(e); }
});

r.post('/cancelAll/rule/:flowId/:version?', authMiddleware, async (req, res, next) => {
  try {
    const v = req.params.version ? Number(req.params.version) : undefined;
    res.json({ success: true, data: await svc.cancelAllForFlow(req.params.flowId, v, req.user!) });
  } catch (e) { next(e); }
});

export default r;
