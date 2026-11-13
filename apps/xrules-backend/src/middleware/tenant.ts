// Tenant guard — one choke point for every internal (Studio/admin) request.
//
// 1. Active tenant = X-Tenant header (slug or id) → ?workspace= → token tenantId → first membership.
//    The caller must be a member, otherwise 403. Result goes on req.tenant.
// 2. The project a request touches is resolved from ?projectId / ?project_id / body.projectId,
//    /projects/:id, or the entity id in the path (rule, flow, spec, bulk run, …).
//    A project in another tenant answers 404 (existence is not leaked).
// 3. Effective project role: tenant OWNER/ADMIN → ADMIN; explicit project member → that role;
//    WORKSPACE-visible project → MEMBER=EDITOR, VIEWER=VIEWER; PRIVATE project → no access.
//    GET/HEAD need VIEWER, other methods need EDITOR, project settings/members need ADMIN.
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import type { AuthUser } from './auth.js';

export type TenantRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
export type ProjectRole = 'ADMIN' | 'EDITOR' | 'VIEWER';
export interface TenantCtx { id: string; slug: string; name: string; role: TenantRole }

declare global {
  namespace Express {
    interface Request { tenant?: TenantCtx; projectRole?: ProjectRole; projectId?: string }
  }
}

const RANK: Record<ProjectRole, number> = { VIEWER: 1, EDITOR: 2, ADMIN: 3 };

/** Paths that are not tenant-scoped (public, health, tenant management itself). */
const EXEMPT = [/^\/auth\//, /^\/api\//, /^\/hooks\//, /^\/ready$/, /^\/metrics$/, /^\/health$/, /^\/workspaces(\/|$)/];

// path pattern → how to find the owning project.  `m` = prisma delegate, `via` = parent hop.
type Hop = { m: string; via?: (row: any) => Promise<string | null>; sel?: Record<string, true> };
const flowOf = (id: string | null) => id ? prisma.flow.findUnique({ where: { id }, select: { projectId: true } }).then(r => r?.projectId ?? null) : Promise.resolve(null);
const ruleOf = (id: string | null) => id ? prisma.rule.findUnique({ where: { id }, select: { projectId: true } }).then(r => r?.projectId ?? null) : Promise.resolve(null);
const H = {
  rule: { m: 'rule' }, flow: { m: 'flow' }, folder: { m: 'folder' }, testSuite: { m: 'testSuite' }, dataset: { m: 'dataset' },
  scenario: { m: 'scenario' }, connection: { m: 'connection' }, model: { m: 'model' }, release: { m: 'release' },
  environment: { m: 'environment' }, simulation: { m: 'simulation' }, job: { m: 'job' }, spec: { m: 'apiSpec' },
  review: { m: 'reviewRequest' }, bulk: { m: 'bulkRun' }, testCase: { m: 'testCase' }, term: { m: 'vocabularyTerm' },
  alert: { m: 'alertRule' }, fileTemplate: { m: 'fileTemplate' },
  op: { m: 'apiOperation', sel: { specId: true }, via: (r: any) => prisma.apiSpec.findUnique({ where: { id: r.specId }, select: { projectId: true } }).then(s => s?.projectId ?? null) },
  execution: { m: 'execution', sel: { ruleId: true, flowId: true }, via: async (r: any) => (await ruleOf(r.ruleId)) ?? flowOf(r.flowId) },
  alertEvent: { m: 'alertEvent', sel: { ruleId: true }, via: (r: any) => prisma.alertRule.findUnique({ where: { id: r.ruleId }, select: { projectId: true } }).then(a => a?.projectId ?? null) },
} satisfies Record<string, Hop>;

const PATTERNS: Array<[RegExp, Hop]> = [
  [/^\/rules\/(?!compare|by-alias)([^/]+)/, H.rule],
  [/^\/flows\/([^/]+)/, H.flow],
  [/^\/folders\/([^/]+)/, H.folder],
  [/^\/test-suites\/([^/]+)/, H.testSuite],
  [/^\/datasets\/([^/]+)/, H.dataset],
  [/^\/scenarios\/([^/]+)/, H.scenario],
  [/^\/connections\/([^/]+)/, H.connection],
  [/^\/models\/([^/]+)/, H.model],
  [/^\/releases\/([^/]+)/, H.release],
  [/^\/environments\/([^/]+)/, H.environment],
  [/^\/simulations\/([^/]+)/, H.simulation],
  [/^\/executions\/([^/]+)/, H.execution],
  [/^\/jobs\/(?:start|cancelAll\/rule)\/([^/]+)/, H.flow],
  [/^\/jobs\/(?:cancel\/)?(?!start|cancel|cancelAll)([^/]+)/, H.job],
  [/^\/tools\/(?:duplicates|dependencies)\/([^/]+)/, H.rule],
  [/^\/platform\/specs\/([^/]+)/, H.spec],
  [/^\/platform\/operations\/([^/]+)/, H.op],
  [/^\/platform\/reviews\/([^/]+)/, H.review],
  [/^\/platform\/executions\/([^/]+)/, H.execution],
  [/^\/platform\/bulk\/([^/]+)/, H.bulk],
  [/^\/platform\/flows\/([^/]+)/, H.flow],
  [/^\/platform\/tests\/target\/rule\/([^/]+)/, H.rule],
  [/^\/platform\/tests\/target\/[^/]+\/([^/]+)/, H.flow],
  [/^\/platform\/tests\/([^/]+)/, H.testCase],
  [/^\/platform\/suites\/([^/]+)/, H.testSuite],
  [/^\/platform\/vocabulary\/(?!suggest|check|rules)([^/]+)/, H.term],
  [/^\/platform\/alerts\/events\/([^/]+)/, H.alertEvent],
  [/^\/platform\/alerts\/(?!events|evaluate)([^/]+)/, H.alert],
  [/^\/platform\/triggers\/([^/]+)/, H.flow],
  [/^\/data\/connections\/([^/]+)/, H.connection],
  [/^\/data\/datasets\/([^/]+)/, H.dataset],
  [/^\/data\/executions\/([^/]+)/, H.execution],
  [/^\/data\/flows\/([^/]+)/, H.flow],
  [/^\/data\/file-templates\/([^/]+)/, H.fileTemplate],
];
// second entity in the same path (e.g. bulk compare) must live in the same tenant too
const SECOND: Array<[RegExp, Hop]> = [[/^\/platform\/bulk\/[^/]+\/compare\/([^/]+)/, H.bulk]];
const PROJECT_PATH = /^\/(?:projects|tools\/drd|jobs\/cancelAll\/space)\/([^/]+)/;

async function projectOfEntity(hop: Hop, id: string): Promise<string | null | undefined> {
  const d = (prisma as any)[hop.m];
  const row = await d.findUnique({ where: { id }, select: hop.sel ?? { projectId: true } }).catch(() => null);
  if (!row) return undefined;                 // unknown id → let the route answer 404
  return hop.via ? hop.via(row) : row.projectId;
}

function deny(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ success: false, error: { code, message } });
}

function readUser(req: Request): AuthUser | null {
  if (req.user) return req.user;
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  try { return (req.user = jwt.verify(h.slice(7), env.jwtSecret) as AuthUser); } catch { return null; }
}

/** Effective project role for a user, or null when they cannot see the project. */
export async function projectRoleFor(userId: string, project: { id: string; visibility: string }, tenantRole: TenantRole): Promise<ProjectRole | null> {
  if (tenantRole === 'OWNER' || tenantRole === 'ADMIN') return 'ADMIN';
  const pm = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId } } });
  if (pm) return pm.role as ProjectRole;
  if (project.visibility === 'PRIVATE') return null;
  return tenantRole === 'VIEWER' ? 'VIEWER' : 'EDITOR';
}

/** Ids of projects in the tenant that the user can see (for list endpoints). */
export async function visibleProjectIds(userId: string, t: TenantCtx): Promise<string[]> {
  const projects = await prisma.project.findMany({ where: { workspaceId: t.id }, select: { id: true, visibility: true } });
  if (t.role === 'OWNER' || t.role === 'ADMIN') return projects.map(p => p.id);
  const mine = new Set((await prisma.projectMember.findMany({ where: { userId, projectId: { in: projects.map(p => p.id) } }, select: { projectId: true } })).map(m => m.projectId));
  return projects.filter(p => p.visibility !== 'PRIVATE' || mine.has(p.id)).map(p => p.id);
}

export async function resolveTenant(user: AuthUser, wanted?: string): Promise<TenantCtx | null> {
  const ms = await prisma.workspaceMember.findMany({ where: { userId: user.userId }, include: { workspace: true }, orderBy: { createdAt: 'asc' } });
  if (!ms.length) return null;
  const pick = wanted ? ms.find(m => m.workspace.slug === wanted || m.workspace.id === wanted) : (ms.find(m => m.workspace.slug === user.tenantId) ?? ms[0]);
  if (!pick) return null;
  return { id: pick.workspace.id, slug: pick.workspace.slug, name: pick.workspace.name, role: pick.role as TenantRole };
}

export async function tenantGuard(req: Request, res: Response, next: NextFunction) {
  const path = req.path;
  if (req.method === 'OPTIONS' || EXEMPT.some(re => re.test(path))) return next();
  const user = readUser(req);
  if (!user) return next();                                   // the route's own authMiddleware answers 401
  try {
    const wanted = (req.headers['x-tenant'] as string) || (req.query.workspace as string) || undefined;
    const tenant = await resolveTenant(user, wanted);
    if (!tenant) return deny(res, 403, 'TENANT_FORBIDDEN', wanted ? `Not a member of tenant '${wanted}'` : 'No tenant membership');
    req.tenant = tenant;

    // which project(s) does this request touch?
    const ids = new Set<string>();
    const direct = (req.query.projectId || req.query.project_id || (req.body && typeof req.body === 'object' ? req.body.projectId : undefined)) as string | undefined;
    if (direct) ids.add(direct);
    const pp = PROJECT_PATH.exec(path);
    if (pp) ids.add(pp[1]);
    for (const list of [PATTERNS, SECOND]) {
      for (const [re, hop] of list) {
        const m = re.exec(path);
        if (!m) continue;
        const pid = await projectOfEntity(hop, decodeURIComponent(m[1]));
        if (pid === null) return deny(res, 404, 'NOT_FOUND', 'Not found');
        if (pid) ids.add(pid);
        break;
      }
    }
    if (!ids.size) return next();                             // tenant-level endpoint; services scope by req.tenant

    const need: ProjectRole = /^\/projects\/[^/]+(\/members|\/?$)/.test(path) && !['GET', 'HEAD'].includes(req.method) ? 'ADMIN'
      : ['GET', 'HEAD'].includes(req.method) ? 'VIEWER' : 'EDITOR';
    let role: ProjectRole | null = null;
    for (const id of ids) {
      const project = await prisma.project.findFirst({ where: { OR: [{ id }, { slug: id, workspaceId: tenant.id }] }, select: { id: true, workspaceId: true, visibility: true } });
      if (!project) continue;                                 // route answers 404 / validation
      if (project.workspaceId !== tenant.id) return deny(res, 404, 'NOT_FOUND', 'Not found');
      const r = await projectRoleFor(user.userId, project, tenant.role);
      if (!r) return deny(res, 404, 'NOT_FOUND', 'Not found');
      if (RANK[r] < RANK[need]) return deny(res, 403, 'FORBIDDEN', `Requires project role ${need} (you are ${r})`);
      role = role && RANK[role] < RANK[r] ? role : r;
      req.projectId = project.id;
    }
    if (role) req.projectRole = role;
    next();
  } catch (e) { next(e); }
}
