import { Router } from 'express';
import * as svc from '../services/rule-compare.service.js';
import { authMiddleware } from '../middleware/auth.js';

const r = Router();

// Compare two versions of the SAME rule
r.get('/rules/:id/compare', authMiddleware, async (req, res, next) => {
  try {
    const a = Number(req.query.a);
    const b = Number(req.query.b);
    res.json({ success: true, data: await svc.compareVersions(req.params.id, a, b, req.user!) });
  } catch (e) { next(e); }
});

// Compare two different rules
r.get('/rules/compare', authMiddleware, async (req, res, next) => {
  try {
    res.json({ success: true, data: await svc.compareRules(req.query.a as string, req.query.b as string, req.user!) });
  } catch (e) { next(e); }
});

export default r;
