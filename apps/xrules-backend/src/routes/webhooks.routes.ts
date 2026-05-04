import { Router } from 'express';
import * as svc from '../services/webhooks.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../config/database.js';

const r = Router();

async function workspaceForUser(userId: string): Promise<string | null> {
  const m = await prisma.workspaceMember.findFirst({ where: { userId } });
  return m?.workspaceId || null;
}

r.get('/', authMiddleware, async (req, res, next) => {
  try {
    const wsId = (req.query.workspaceId as string) || (await workspaceForUser(req.user!.userId));
    if (!wsId) { res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'workspaceId required' } }); return; }
    res.json({ success: true, data: await svc.list(wsId, req.user!) });
  } catch (e) { next(e); }
});

r.post('/', authMiddleware, async (req, res, next) => {
  try {
    const wsId = req.body.workspaceId || (await workspaceForUser(req.user!.userId));
    if (!wsId) { res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'workspaceId required' } }); return; }
    const created = await svc.create({ ...req.body, workspaceId: wsId }, req.user!);
    res.status(201).json({ success: true, data: created, secret: (created as any).secret });
  } catch (e) { next(e); }
});

r.put('/:id', authMiddleware, async (req, res, next) => {
  try { res.json({ success: true, data: await svc.update(req.params.id, req.body, req.user!) }); } catch (e) { next(e); }
});

r.delete('/:id', authMiddleware, async (req, res, next) => {
  try { await svc.remove(req.params.id, req.user!); res.json({ success: true }); } catch (e) { next(e); }
});

export default r;
