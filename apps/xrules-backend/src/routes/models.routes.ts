import { Router, Request, Response, NextFunction } from 'express';
import * as modelsService from '../services/models.service.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = req.query.project_id as string;
    if (!projectId) {
      res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'project_id required' } });
      return;
    }
    const result = await modelsService.listModels(projectId, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await modelsService.getModel(req.params.id, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await modelsService.createModel(req.body, req.user!);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.put('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await modelsService.updateModel(req.params.id, req.body, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await modelsService.deleteModel(req.params.id, req.user!);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
