import { Router } from 'express';
import * as svc from '../services/tools.service.js';
import { authMiddleware } from '../middleware/auth.js';

const r = Router();

r.get('/duplicates/:ruleId/:version?', authMiddleware, async (req, res, next) => {
  try {
    const v = req.params.version ? Number(req.params.version) : undefined;
    res.json({ success: true, data: await svc.duplicates(req.params.ruleId, v, req.user!) });
  } catch (e) { next(e); }
});

r.get('/dependencies/:ruleId/:version?', authMiddleware, async (req, res, next) => {
  try {
    const v = req.params.version ? Number(req.params.version) : undefined;
    res.json({ success: true, data: await svc.dependencies(req.params.ruleId, v, req.user!) });
  } catch (e) { next(e); }
});

export default r;
