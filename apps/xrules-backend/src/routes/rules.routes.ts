import { Router, Request, Response, NextFunction } from 'express';
import * as rulesService from '../services/rules.service.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = req.query.project_id as string;
    const status = req.query.status as string | undefined;

    if (!projectId) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Project ID is required' },
      });
      return;
    }

    const result = await rulesService.listRules(projectId, req.user!, status);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await rulesService.getRule(req.params.id, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await rulesService.createRule(req.body, req.user!);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.put('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await rulesService.updateRule(req.params.id, req.body, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await rulesService.deleteRule(req.params.id, req.user!);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/:id/publish', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await rulesService.publishRule(req.params.id, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/:id/versions', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await rulesService.getRuleVersions(req.params.id, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/:id/restore', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { version } = req.body;
    const result = await rulesService.restoreRuleVersion(req.params.id, version, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// Lock / unlock — when locked, edits via PUT are rejected unless user toggles unlock first.
router.patch('/:id/lock', authMiddleware, async (req, res, next) => {
  try {
    const result = await rulesService.setLock(req.params.id, true, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.patch('/:id/unlock', authMiddleware, async (req, res, next) => {
  try {
    const result = await rulesService.setLock(req.params.id, false, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// Resolve a rule by alias within the user's tenant project space (cheap shortcut).
router.get('/by-alias/:alias', authMiddleware, async (req, res, next) => {
  try {
    const projectId = req.query.project_id as string;
    if (!projectId) {
      res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'project_id required' } });
      return;
    }
    const result = await rulesService.findByAlias(projectId, req.params.alias, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export default router;
