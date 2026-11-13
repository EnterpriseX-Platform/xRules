import { Router, Request, Response, NextFunction } from 'express';
import * as apikeysService from '../services/apikeys.service.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = (req.query.workspace as string) || req.user!.tenantId || '';
    const result = await apikeysService.listApiKeys(workspace, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await apikeysService.createApiKey(req.body, req.user!);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.put('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try { res.json({ success: true, data: await apikeysService.updateApiKey(req.params.id, req.body, req.user!) }); } catch (err) { next(err); }
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await apikeysService.revokeApiKey(req.params.id, req.user!);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
