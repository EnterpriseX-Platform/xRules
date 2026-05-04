import { Router, Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Email and password are required' },
      });
      return;
    }
    const result = await authService.login(email, password);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/me', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.getMe(req.user!.userId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Refresh token is required' },
      });
      return;
    }
    const result = await authService.refreshAccessToken(refresh_token);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/logout', (_req: Request, res: Response) => {
  res.json({ success: true });
});

export default router;
