import { Router, Request, Response, NextFunction } from 'express';
import * as analyticsService from '../services/analytics.service.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/summary', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = (req.query.workspace as string) || req.user!.tenantId || '';
    const result = await analyticsService.getExecutionSummary(workspace, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/status', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = (req.query.workspace as string) || req.user!.tenantId || '';
    const result = await analyticsService.getStatusBreakdown(workspace, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/top-rules', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = (req.query.workspace as string) || req.user!.tenantId || '';
    const limit = parseInt(req.query.limit as string || '10', 10);
    const result = await analyticsService.getTopRules(workspace, req.user!, limit);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/timeseries', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = (req.query.workspace as string) || req.user!.tenantId || '';
    const interval = (req.query.interval as string) || 'day';
    const result = await analyticsService.getTimeseries(workspace, req.user!, interval);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export default router;
