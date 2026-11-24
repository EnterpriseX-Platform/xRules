import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database.js';
import { apiKeyAuthMiddleware } from '../middleware/apiKeyAuth.js';

/**
 * Read-only catalogue for systems that call xRules with an API key.
 *
 * A calling system needs to know which rules it may call, which published versions exist and
 * what each version takes and returns, so it can pin a version and map its own fields to the
 * rule's input/output. These endpoints expose exactly that and nothing else (no definitions).
 *
 *   GET /api/v1/rules                               published rules in the key's workspace
 *   GET /api/v1/rules/:idOrAlias/versions           published versions of one rule
 *   GET /api/v1/rules/:idOrAlias/versions/:version  one version with its input/output schema
 *
 * A version snapshot (rule_versions row) is written only when that version is published, so
 * every snapshot is a published version.
 *
 * The key needs the `read` scope. A key limited to chosen REST APIs cannot list rules.
 */
const router = Router();

function requireRead(req: Request, res: Response): boolean {
  const key = req.apiKey as any;
  if (!key?.scopes?.includes('read')) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'API key does not have read scope' } });
    return false;
  }
  if (key.specIds?.length) {
    res.status(403).json({ success: false, error: { code: 'KEY_LIMITED_TO_APIS', message: 'This API key may only call its REST APIs' } });
    return false;
  }
  return true;
}

const ruleSelect = {
  id: true, name: true, alias: true, slug: true, description: true, type: true,
  status: true, version: true, tags: true, updatedAt: true,
  project: { select: { id: true, name: true } },
} as const;

function ruleView(r: any) {
  return {
    id: r.id, name: r.name, alias: r.alias, slug: r.slug, description: r.description,
    type: r.type, status: r.status, currentVersion: r.version, tags: r.tags,
    project: r.project, updatedAt: r.updatedAt,
  };
}

// Rule by id, else by alias, else by slug — always inside the key's workspace.
async function findRule(idOrAlias: string, workspaceId: string) {
  const inWs = { project: { workspaceId } };
  return (await prisma.rule.findFirst({ where: { id: idOrAlias, ...inWs }, select: ruleSelect }))
    || (await prisma.rule.findFirst({ where: { alias: idOrAlias, ...inWs }, select: ruleSelect }))
    || (await prisma.rule.findFirst({ where: { slug: idOrAlias, ...inWs }, select: ruleSelect }));
}

router.get('/rules', apiKeyAuthMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!requireRead(req, res)) return;
    const where: any = {
      project: { workspaceId: req.apiKey!.workspaceId },
      versions: { some: {} },
    };
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { alias: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (typeof req.query.type === 'string' && req.query.type) where.type = req.query.type;
    const rules = await prisma.rule.findMany({ where, select: ruleSelect, orderBy: { name: 'asc' }, take: 500 });
    const latest = await prisma.ruleVersion.groupBy({
      by: ['ruleId'],
      where: { ruleId: { in: rules.map(r => r.id) } },
      _max: { version: true },
    });
    const latestBy = new Map(latest.map(l => [l.ruleId, l._max.version]));
    res.json({
      success: true,
      data: rules.map(r => ({ ...ruleView(r), latestPublishedVersion: latestBy.get(r.id) ?? null })),
    });
  } catch (e) { next(e); }
});

router.get('/rules/:idOrAlias/versions', apiKeyAuthMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!requireRead(req, res)) return;
    const rule = await findRule(req.params.idOrAlias, req.apiKey!.workspaceId);
    if (!rule) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rule not found' } }); return; }
    const versions = await prisma.ruleVersion.findMany({
      where: { ruleId: rule.id },
      select: { version: true, message: true, createdAt: true },
      orderBy: { version: 'desc' },
    });
    res.json({ success: true, data: { rule: ruleView(rule), versions: versions.map(v => ({ ...v, status: 'PUBLISHED' })) } });
  } catch (e) { next(e); }
});

router.get('/rules/:idOrAlias/versions/:version', apiKeyAuthMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!requireRead(req, res)) return;
    const version = Number(req.params.version);
    if (!Number.isInteger(version) || version < 1) {
      res.status(400).json({ success: false, error: { code: 'BAD_VERSION', message: 'Version must be a positive whole number' } }); return;
    }
    const rule = await findRule(req.params.idOrAlias, req.apiKey!.workspaceId);
    if (!rule) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rule not found' } }); return; }
    const v = await prisma.ruleVersion.findUnique({
      where: { ruleId_version: { ruleId: rule.id, version } },
      select: { version: true, message: true, createdAt: true, inputSchema: true, outputSchema: true },
    });
    if (!v) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Published version ${version} not found for rule` } }); return;
    }
    res.json({ success: true, data: { rule: ruleView(rule), ...v, status: 'PUBLISHED' } });
  } catch (e) { next(e); }
});

export default router;
