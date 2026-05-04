import { Router } from 'express';
import { ruleOpenapi } from '../services/openapi.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { apiKeyAuthMiddleware } from '../middleware/apiKeyAuth.js';

const r = Router();

// Hybrid auth: accept either X-API-Key or JWT. Tries API key first, falls
// back to JWT auth. Either grants access; rule scope check downstream.
async function hybridAuth(req: any, res: any, next: any) {
  if (req.headers['x-api-key']) return apiKeyAuthMiddleware(req, res, next);
  return authMiddleware(req, res, next);
}

r.get('/rules/:id/openapi.json', hybridAuth, async (req, res, next) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    // When auth came via API key, req.user is undefined — pass apiKey context.
    res.json(await ruleOpenapi(req.params.id, req.user, baseUrl, req.apiKey));
  } catch (e) { next(e); }
});

// Public, no auth at all — minimal spec for embedding in external docs
r.get('/rules/:id/openapi.public.json', async (req, res, next) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json(await ruleOpenapi(req.params.id, undefined, baseUrl));
  } catch (e) { next(e); }
});

export default r;
