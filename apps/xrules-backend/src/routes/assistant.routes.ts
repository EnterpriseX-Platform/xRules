import { Router } from 'express';
import * as svc from '../services/assistant.service.js';
import { authMiddleware } from '../middleware/auth.js';

const r = Router();

r.post('/chat', authMiddleware, async (req, res, next) => {
  try {
    const { projectId, messages, provider, model } = req.body || {};
    const out = await svc.chat(projectId, messages, req.user!, { provider, model });
    res.json({ success: true, data: out });
  } catch (e) { next(e); }
});

export default r;
