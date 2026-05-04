import { Router } from 'express';
import * as svc from '../services/environments.service.js';
import { authMiddleware } from '../middleware/auth.js';

const r = Router();

r.get('/', authMiddleware, async (req, res, next) => {
  try {
    const projectId = req.query.project_id as string;
    if (!projectId) { res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'project_id required' } }); return; }
    res.json({ success: true, data: await svc.list(projectId, req.user!) });
  } catch (e) { next(e); }
});

r.post('/', authMiddleware, async (req, res, next) => {
  try { res.status(201).json({ success: true, data: await svc.create(req.body, req.user!) }); } catch (e) { next(e); }
});

r.post('/:id/pin', authMiddleware, async (req, res, next) => {
  try {
    const { releaseId } = req.body;
    res.json({ success: true, data: await svc.pinRelease(req.params.id, releaseId, req.user!) });
  } catch (e) { next(e); }
});

r.delete('/:id', authMiddleware, async (req, res, next) => {
  try { await svc.remove(req.params.id, req.user!); res.json({ success: true }); } catch (e) { next(e); }
});

export default r;
