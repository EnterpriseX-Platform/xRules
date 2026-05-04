import { Router, Request, Response, NextFunction } from 'express';
import * as executionsService from '../services/executions.service.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await executionsService.listExecutions(
      req.query as { rule_id?: string; status?: string; page?: string; limit?: string },
      req.user!,
    );
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

export default router;
