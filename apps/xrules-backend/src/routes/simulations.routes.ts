import { Router } from 'express';
import * as svc from '../services/simulations.service.js';
import { authMiddleware } from '../middleware/auth.js';

const r = Router();

r.get('/', authMiddleware, async (req, res, next) => {
  try {
    const projectId = req.query.project_id as string;
    if (!projectId) { res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'project_id required' } }); return; }
    res.json({ success: true, data: await svc.list(projectId, req.user!) });
  } catch (e) { next(e); }
});

r.get('/:id', authMiddleware, async (req, res, next) => {
  try { res.json({ success: true, data: await svc.get(req.params.id, req.user!) }); } catch (e) { next(e); }
});

r.post('/diff', authMiddleware, async (req, res, next) => {
  try {
    const { projectId, name, ...config } = req.body;
    res.status(201).json({ success: true, data: await svc.runDiff(projectId, name || 'Diff', config, req.user!) });
  } catch (e) { next(e); }
});

r.post('/replay', authMiddleware, async (req, res, next) => {
  try {
    const { projectId, name, ...config } = req.body;
    res.status(201).json({ success: true, data: await svc.runReplay(projectId, name || 'Replay', config, req.user!) });
  } catch (e) { next(e); }
});

r.post('/sweep', authMiddleware, async (req, res, next) => {
  try {
    const { projectId, name, ...config } = req.body;
    res.status(201).json({ success: true, data: await svc.runSweep(projectId, name || 'Sweep', config, req.user!) });
  } catch (e) { next(e); }
});

export default r;
