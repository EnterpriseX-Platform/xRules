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

// ---------------------------------------------------------------- references between rules, flows and APIs
type Ref = { kind: 'rule' | 'flow'; ref: string };
const RULE_NODES = new Set(['rulecall', 'rule']);
const FLOW_NODES = new Set(['calldecisionflow', 'subflow']);

/** Rule / flow references written in a flow graph (node types are matched case-insensitively). */
export function refsInGraph(graph: any): Ref[] {
  const out: Ref[] = [];
  for (const n of graph?.nodes ?? []) {
    const t = String(n.type ?? n.data?.kind ?? '').toLowerCase().replace(/[^a-z]/g, '');
    const d = n.data ?? {};
    if (RULE_NODES.has(t)) { const r = d.ruleSlug || d.rule || d.slug || d.ruleId; if (r) out.push({ kind: 'rule', ref: String(r) }); }
    if (FLOW_NODES.has(t)) { const f = d.flow || d.flowSlug; if (f) out.push({ kind: 'flow', ref: String(f) }); }
  }
  return out;
}

const brief = async (kind: 'rule' | 'flow', row: any) => {
  const p = await prisma.project.findUnique({ where: { id: row.projectId }, select: { slug: true, name: true, kind: true } });
  return { kind, id: row.id, slug: row.slug, name: row.name, status: String(row.status ?? '').toLowerCase(), flowKind: row.kind,
    project: { slug: p?.slug, name: p?.kind === 'INTEGRATION' ? 'Integration' : p?.name } };
};

/** What a flow calls: rules and decision flows, resolved from the flow's own project. */
export async function flowUses(flowId: string) {
  const f = await prisma.flow.findUnique({ where: { id: flowId } });
  if (!f) throw new NotFoundError('Flow');
  const seen = new Set<string>(); const items: any[] = []; const missing: string[] = [];
  for (const r of refsInGraph(f.graph)) {
    const key = `${r.kind}:${r.ref}`; if (seen.has(key)) continue; seen.add(key);
    const row = await resolveRef<any>(r.kind, f.projectId, r.ref).catch(() => null);
    if (row) items.push(await brief(r.kind, row)); else missing.push(r.ref);
  }
  return { items, missing };
}

/** Who calls a rule or flow: flows anywhere in the tenant (draft graph), plus REST API operations running those flows. */
export async function usedBy(kind: 'rule' | 'flow', id: string) {
  const target = kind === 'rule' ? await prisma.rule.findUnique({ where: { id } }) : await prisma.flow.findUnique({ where: { id } });
  if (!target) throw new NotFoundError(kind === 'rule' ? 'Rule' : 'Flow');
  const home = await prisma.project.findUnique({ where: { id: target.projectId }, select: { workspaceId: true, slug: true } });
  const flows = await prisma.flow.findMany({ where: { project: { workspaceId: home!.workspaceId }, id: { not: kind === 'flow' ? id : undefined } },
    select: { id: true, slug: true, name: true, status: true, kind: true, projectId: true, graph: true } });
  const names = new Set([target.id, target.slug, (target as any).alias, `${home!.slug}/${target.slug}`].filter(Boolean));
  const callers: any[] = [];
  for (const f of flows) {
    const hit = refsInGraph(f.graph).some(r => r.kind === kind && names.has(r.ref));
    if (!hit) continue;
    // a bare slug resolves to the caller's own project first — make sure it really points at this target
    const resolved = await resolveRef<any>(kind, f.projectId, refsInGraph(f.graph).find(r => r.kind === kind && names.has(r.ref))!.ref).catch(() => null);
    if (resolved?.id === target.id) callers.push(f);
  }
  const items = await Promise.all(callers.map(f => brief('flow', f)));
  const ops = await prisma.apiOperation.findMany({ where: { flowId: { in: [...callers.map(f => f.id), ...(kind === 'flow' ? [id] : [])] } },
    include: { spec: { select: { id: true, name: true, basePath: true, version: true } } } });
  return { flows: items, operations: ops.map(o => ({ id: o.id, method: o.method, path: o.path, spec: o.spec, flowId: o.flowId })) };
}
