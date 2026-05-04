import { Router, Request, Response, NextFunction } from 'express';
import * as dashboardService from '../services/dashboard.service.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = (req.query.workspace as string) || req.user!.tenantId || '';
    const result = await dashboardService.getDashboard(workspace, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export default router;
