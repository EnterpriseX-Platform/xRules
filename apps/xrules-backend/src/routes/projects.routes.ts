import { Router, Request, Response, NextFunction } from 'express';
import * as projectsService from '../services/projects.service.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceSlug = req.query.workspace as string;
    if (!workspaceSlug) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Workspace slug is required' },
      });
      return;
    }
    const result = await projectsService.listProjects(workspaceSlug, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await projectsService.getProject(req.params.id, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await projectsService.createProject(req.body, req.user!);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.put('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await projectsService.updateProject(req.params.id, req.body, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await projectsService.deleteProject(req.params.id, req.user!);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
