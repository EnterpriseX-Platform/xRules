import { Router } from 'express';
import * as svc from '../services/bi.service.js';
import { authMiddleware } from '../middleware/auth.js';

const r = Router();

function parseListOpts(req: any) {
  const q = req.query;
  return {
    workspaceId: req.tenant!.id,   // always the active tenant — never from the query
    ruleIds:        Array.isArray(q.ruleIds)        ? q.ruleIds        : (q.ruleIds        ? [q.ruleIds]        : undefined),
    correlationIds: Array.isArray(q.correlationIds) ? q.correlationIds : (q.correlationIds ? [q.correlationIds] : undefined),
    apiKeyIds:      Array.isArray(q.apiKeyIds)      ? q.apiKeyIds      : (q.apiKeyIds      ? [q.apiKeyIds]      : undefined),
    tags:           Array.isArray(q.tags)           ? q.tags           : (q.tags           ? [q.tags]           : undefined),
    status:         Array.isArray(q.status)         ? q.status         : (q.status         ? [q.status]         : undefined),
    fields:         Array.isArray(q.fields)         ? q.fields         : (q.fields         ? [q.fields]         : undefined),
    dateGte: q.date_gte as string,
    dateLte: q.date_lte as string,
    pageSize: q.page_size ? Number(q.page_size) : undefined,
    after: q.after as string,
  };
}

r.get('/audit/v2', authMiddleware, async (req, res, next) => {
  try {
    res.json({ success: true, ...(await svc.listAudits(parseListOpts(req), req.user!)) });
  } catch (e) { next(e); }
});

r.get('/audit/v2/count', authMiddleware, async (req, res, next) => {
  try {
    res.json({ success: true, ...(await svc.countAudits(parseListOpts(req), req.user!)) });
  } catch (e) { next(e); }
});

r.delete('/audit/v2', authMiddleware, async (req, res, next) => {
  try {
    const ids = req.body?.ids || [];
    res.json({ success: true, ...(await svc.deleteAudits(ids, req.user!, req.tenant!.id)) });
  } catch (e) { next(e); }
});

export default r;
