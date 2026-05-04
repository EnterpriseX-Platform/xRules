import { Router, Request, Response, NextFunction } from 'express';
import * as executeService from '../services/execute.service.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rule_id, input, context } = req.body;
    const result = await executeService.executeRule(rule_id, input, context, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export default router;
