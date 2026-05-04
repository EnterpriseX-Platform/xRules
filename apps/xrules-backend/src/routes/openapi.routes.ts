import { Router } from 'express';
import { ruleOpenapi } from '../services/openapi.service.js';
import { authMiddleware } from '../middleware/auth.js';

const r = Router();

// Authenticated — full spec including project metadata
r.get('/rules/:id/openapi.json', authMiddleware, async (req, res, next) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json(await ruleOpenapi(req.params.id, req.user!, baseUrl));
  } catch (e) { next(e); }
});

// Public, by API key — minimal info for SDK gen / external docs
r.get('/rules/:id/openapi.public.json', async (req, res, next) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json(await ruleOpenapi(req.params.id, undefined, baseUrl));
  } catch (e) { next(e); }
});

export default r;
