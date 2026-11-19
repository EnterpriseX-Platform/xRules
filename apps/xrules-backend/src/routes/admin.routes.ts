import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as admin from '../services/admin.service.js';

const router = Router();
router.use(authMiddleware, async (req: Request, _res: Response, next: NextFunction) => {
  try { await admin.assertSystemAdmin(req.user!.userId); next(); } catch (e) { next(e); }
});
const h = (fn: (req: Request) => Promise<any>, code = 200) => async (req: Request, res: Response, next: NextFunction) => {
  try { res.status(code).json({ success: true, data: await fn(req) }); } catch (e) { next(e); }
};
router.get('/orgs', h(() => admin.listOrgs()));
router.post('/orgs', h(req => admin.createOrg(req.body), 201));
router.get('/orgs/:id', h(req => admin.getOrg(req.params.id)));
router.patch('/orgs/:id', h(req => admin.updateOrg(req.params.id, req.body)));
router.get('/users', h(() => admin.listUsers()));
router.patch('/users/:id', h(req => admin.updateUser(req.params.id, req.body, req.user!.userId)));
router.post('/users/:id/move', h(req => admin.moveUser(req.params.id, req.body)));
router.post('/users/:id/reset-password', h(req => admin.resetPassword(req.params.id)));
router.get('/settings', h(() => admin.getSettings()));
router.put('/settings', h(req => admin.setSettings(req.body || {})));
export default router;
