import { Router } from 'express';
import * as svc from '../services/testsuites.service.js';
import { authMiddleware } from '../middleware/auth.js';

const r = Router();

r.get('/', authMiddleware, async (req, res, next) => {
  try {
    const projectId = req.query.project_id as string;
    if (!projectId) { res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'project_id required' } }); return; }
    res.json({ success: true, data: await svc.listSuites(projectId, req.user!) });
  } catch (e) { next(e); }
});

r.get('/:id', authMiddleware, async (req, res, next) => {
  try { res.json({ success: true, data: await svc.getSuite(req.params.id, req.user!) }); } catch (e) { next(e); }
});

r.post('/', authMiddleware, async (req, res, next) => {
  try { res.status(201).json({ success: true, data: await svc.createSuite(req.body, req.user!) }); } catch (e) { next(e); }
});

r.put('/:id', authMiddleware, async (req, res, next) => {
  try { res.json({ success: true, data: await svc.updateSuite(req.params.id, req.body, req.user!) }); } catch (e) { next(e); }
});

r.delete('/:id', authMiddleware, async (req, res, next) => {
  try { await svc.deleteSuite(req.params.id, req.user!); res.json({ success: true }); } catch (e) { next(e); }
});

r.post('/:id/run', authMiddleware, async (req, res, next) => {
  try { res.json({ success: true, data: await svc.runSuite(req.params.id, req.body?.datasetId, req.user!) }); } catch (e) { next(e); }
});

export default r;
