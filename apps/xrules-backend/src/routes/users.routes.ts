import { Router, Request, Response, NextFunction } from 'express';
import * as usersService from '../services/users.service.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// POST /auth/signup
router.post('/signup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await usersService.signup(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

// PUT /auth/profile
router.put('/profile', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await usersService.updateProfile(req.user!.userId, req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// PUT /auth/password
router.put('/password', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await usersService.changePassword(req.user!.userId, req.body);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /workspaces/:id/members
router.get('/:id/members', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await usersService.listMembers(req.params.id, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// PUT /workspaces/:id/members/:memberId
router.put('/:id/members/:memberId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await usersService.updateMemberRole(req.params.id, req.params.memberId, req.body.role, req.user!);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// DELETE /workspaces/:id/members/:memberId
router.delete('/:id/members/:memberId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await usersService.removeMember(req.params.id, req.params.memberId, req.user!);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
