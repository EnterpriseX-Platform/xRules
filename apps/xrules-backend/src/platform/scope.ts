// Tenant scope helpers.
//
// A tenant has many DECISION projects (rules + decision flows) and one INTEGRATION project — the shared
// hub with connections, data sets, REST APIs and triggers. Anything inside a tenant may reference a
// decision flow, rule or data set from another project of the same tenant:
//   "neb-prescreen"                    → same project first, then the only match in the tenant
//   "neb-pre-screening/neb-prescreen"  → explicit <project-slug>/<slug>
// References never cross tenants.
import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from '../services/_access.js';
import { visibleProjectIds, type TenantCtx } from '../middleware/tenant.js';
import type { AuthUser } from '../middleware/auth.js';

export const INTEGRATION_SLUG = '_integration';
export const ALL_PROJECTS = '_all';

/** The tenant's integration hub, created on first use. */
export async function integrationProject(workspaceId: string) {
  const hit = await prisma.project.findFirst({ where: { workspaceId, kind: 'INTEGRATION' } });
  if (hit) return hit;
  try {
    return await prisma.project.create({ data: { workspaceId, kind: 'INTEGRATION', slug: INTEGRATION_SLUG, name: 'Integration',
      description: 'Shared connections, data sets, REST APIs and triggers for this tenant' } });
  } catch {
    return prisma.project.findFirstOrThrow({ where: { workspaceId, kind: 'INTEGRATION' } });  // created concurrently
  }
}

async function tenantOf(projectId: string) {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
  if (!p) throw new NotFoundError('Project');
  return p.workspaceId;
}

type Kind = 'flow' | 'rule' | 'dataset';
const delegate = (k: Kind) => (k === 'flow' ? prisma.flow : k === 'rule' ? prisma.rule : prisma.dataset) as any;

/**
 * Resolve a flow / rule / data set reference seen from `projectId`.
 * Returns the row (with id + projectId) or null.
 */
export async function resolveRef<T = any>(kind: Kind, projectId: string, ref: string, extraWhere: any = {}): Promise<T | null> {
  const d = delegate(kind);
  const byKey = (k: string) => (kind === 'dataset' ? [{ slug: k }] : [{ id: k }, { slug: k }, { alias: k }]);
  // explicit "<project>/<slug>"
  if (ref.includes('/')) {
    const [proj, key] = ref.split('/', 2);
    const ws = await tenantOf(projectId);
    const p = await prisma.project.findFirst({ where: { workspaceId: ws, slug: proj } });
    if (!p) return null;
    return d.findFirst({ where: { projectId: p.id, OR: byKey(key), ...extraWhere } });
  }
  const local = await d.findFirst({ where: { projectId, OR: byKey(ref), ...extraWhere } });
  if (local) return local;
  // anywhere in the tenant — must be unambiguous
  const ws = await tenantOf(projectId);
  const hits = await d.findMany({ where: { project: { workspaceId: ws }, OR: byKey(ref), ...extraWhere }, take: 2 });
  if (hits.length > 1) throw new ValidationError(`'${ref}' exists in more than one project — use <project>/${ref}`);
  return hits[0] ?? null;
}

/** Project ids a tenant-level list covers: one project, or every project the user can see ("_all"). */
export async function projectScope(idOrSlug: string | undefined, user: AuthUser): Promise<string[]> {
  if (!idOrSlug || idOrSlug === ALL_PROJECTS || idOrSlug === 'undefined') {
    const t: TenantCtx | undefined = (user as any).tenant;
    if (!t) throw new ValidationError('Tenant is required');
    return visibleProjectIds(user.userId, t);
  }
  const p = await assertProjectAccess(idOrSlug, user);
  return [p.id];
}

/** Project a new item should belong to when it is created from a tenant-level screen. */
export async function projectForCreate(idOrSlug: string | undefined, user: AuthUser, fallbackFrom?: { flowId?: string; ruleId?: string }) {
  if (idOrSlug && idOrSlug !== ALL_PROJECTS) return assertProjectAccess(idOrSlug, user, 'write');
  const owner = fallbackFrom?.flowId ? await prisma.flow.findUnique({ where: { id: fallbackFrom.flowId }, select: { projectId: true } })
    : fallbackFrom?.ruleId ? await prisma.rule.findUnique({ where: { id: fallbackFrom.ruleId }, select: { projectId: true } }) : null;
  if (!owner) throw new ValidationError('Choose a project');
  return assertProjectAccess(owner.projectId, user, 'write');
}

/** Run a per-project list for one project, or for every visible project when given "_all"; results tagged with their project. */
export async function listAcross<T>(idOrSlug: string, user: AuthUser, list: (projectId: string) => Promise<T[] | { items: T[] }>): Promise<T[]> {
  if (idOrSlug !== ALL_PROJECTS) { const r: any = await list(idOrSlug); return Array.isArray(r) ? r : r.items; }
  const ids = await projectScope(ALL_PROJECTS, user);
  const projects = await prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, name: true, kind: true } });
  const parts = await Promise.all(projects.map(async p => {
    const r: any = await list(p.id);
    return (Array.isArray(r) ? r : r.items).map((x: any) => ({ ...x, project: { slug: p.slug, name: p.kind === 'INTEGRATION' ? 'Integration' : p.name } }));
  }));
  return parts.flat();
}
