import { Router, Request, Response, NextFunction } from 'express';
import * as testcasesService from '../services/testcases.service.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /rules/:ruleId/tests
router.get('/:ruleId/tests', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await testcasesService.listTestCases(req.params.ruleId, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// POST /rules/:ruleId/tests
router.post('/:ruleId/tests', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await testcasesService.createTestCase(req.params.ruleId, req.body, req.user!);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

// DELETE /rules/:ruleId/tests/:testId
router.delete('/:ruleId/tests/:testId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await testcasesService.deleteTestCase(req.params.testId, req.user!);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /rules/:ruleId/tests/run-all
router.post('/:ruleId/tests/run-all', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await testcasesService.runAllTests(req.params.ruleId, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export default router;
