import { Router, Request, Response, NextFunction } from 'express';
import * as svc from '../services/flows.service.js';
import { authMiddleware } from '../middleware/auth.js';

const r = Router();

r.get('/', authMiddleware, async (req, res, next) => {
  try {
    const projectId = req.query.project_id as string;
    if (!projectId) { res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'project_id required' } }); return; }
    res.json({ success: true, data: await svc.listFlows(projectId, req.user!, req.query.status as string) });
  } catch (e) { next(e); }
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

r.post('/:id/publish', authMiddleware, async (req, res, next) => {
  try { res.json({ success: true, data: await svc.publishFlow(req.params.id, req.body?.message, req.user!) }); } catch (e) { next(e); }
});

export default r;
