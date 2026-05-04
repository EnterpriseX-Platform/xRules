import { Router } from 'express';
import * as svc from '../services/folders.service.js';
import { authMiddleware } from '../middleware/auth.js';

const r = Router();

r.get('/', authMiddleware, async (req, res, next) => {
  try {
    const projectId = req.query.project_id as string;
    if (!projectId) { res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'project_id required' } }); return; }
    res.json({ success: true, data: await svc.tree(projectId, req.user!) });
  } catch (e) { next(e); }
});

r.post('/', authMiddleware, async (req, res, next) => {
  try { res.status(201).json({ success: true, data: await svc.create(req.body, req.user!) }); } catch (e) { next(e); }
});

r.patch('/:id/rename', authMiddleware, async (req, res, next) => {
  try { res.json({ success: true, data: await svc.rename(req.params.id, req.body.name, req.user!) }); } catch (e) { next(e); }
});

r.patch('/:id/move', authMiddleware, async (req, res, next) => {
  try {
    res.json({ success: true, data: await svc.move(req.params.id, req.body.parentId ?? null, req.body.position, req.user!) });
  } catch (e) { next(e); }
});

r.delete('/:id', authMiddleware, async (req, res, next) => {
  try { await svc.remove(req.params.id, req.user!); res.json({ success: true }); } catch (e) { next(e); }
});

r.post('/move-item', authMiddleware, async (req, res, next) => {
  try {
    const { kind, itemId, folderId } = req.body;
    await svc.moveItem(kind, itemId, folderId ?? null, req.user!);
    res.json({ success: true });
  } catch (e) { next(e); }
});

r.get('/:id/export', authMiddleware, async (req, res, next) => {
  try { res.json({ success: true, data: await svc.exportBundle(req.params.id, req.user!) }); } catch (e) { next(e); }
});

export default r;
