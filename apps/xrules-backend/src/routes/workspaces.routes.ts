import { Router, Request, Response, NextFunction } from 'express';
import * as workspacesService from '../services/workspaces.service.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await workspacesService.listWorkspaces(req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await workspacesService.getWorkspace(req.params.id, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await workspacesService.createWorkspace(req.body, req.user!);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/:id/members', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await workspacesService.addMember(req.params.id, req.body, req.user!);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

export default router;
