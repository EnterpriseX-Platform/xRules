// Projects live inside a tenant. Access is enforced by middleware/tenant.ts; this layer only
// shapes data and applies tenant-level rules (who may create, visibility, project members).
import { prisma } from '../config/database.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import { generateSlug } from '../utils/slug.js';
import { projectRoleFor, visibleProjectIds, type TenantCtx, type ProjectRole } from '../middleware/tenant.js';

const VIS = ['WORKSPACE', 'PRIVATE'];
const PROLES: ProjectRole[] = ['ADMIN', 'EDITOR', 'VIEWER'];

function formatProject(project: any, tenant: { id: string; slug: string }, myRole?: ProjectRole | null) {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description,
    visibility: project.visibility,
    workspaceId: tenant.id,
    workspaceSlug: tenant.slug,
    myRole: myRole ?? undefined,
    memberCount: project._count?.members ?? undefined,
    status: 'active' as const,
    ruleCount: project._count?.rules ?? 0,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export async function listProjects(userId: string, t: TenantCtx) {
  const ids = await visibleProjectIds(userId, t);
  const projects = await prisma.project.findMany({
    where: { id: { in: ids } }, orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { rules: true, members: true } } },
  });
  return Promise.all(projects.map(async p => formatProject(p, t, await projectRoleFor(userId, p, t.role))));
}

export async function getProject(id: string, userId: string, t: TenantCtx) {
  const p = await prisma.project.findFirst({ where: { workspaceId: t.id, OR: [{ id }, { slug: id }] }, include: { _count: { select: { rules: true, members: true } } } });
  if (!p) throw new NotFoundError('Project');
  return formatProject(p, t, await projectRoleFor(userId, p, t.role));
}

export async function createProject(data: { name: string; description?: string; visibility?: string }, userId: string, t: TenantCtx) {
  if (t.role === 'VIEWER') throw new ForbiddenError('Viewers cannot create projects');
  if (!data.name?.trim()) throw new ValidationError('Project name is required');
  const visibility = (data.visibility ?? 'WORKSPACE').toUpperCase();
  if (!VIS.includes(visibility)) throw new ValidationError('Visibility must be WORKSPACE or PRIVATE');
  const base = generateSlug(data.name);
  let slug = base; let n = 1;
  while (await prisma.project.findUnique({ where: { workspaceId_slug: { workspaceId: t.id, slug } } })) slug = `${base}-${n++}`;
  // the creator administers the project they made
  const p = await prisma.project.create({
    data: { name: data.name.trim(), slug, description: data.description, visibility, workspaceId: t.id,
      members: { create: { userId, role: 'ADMIN' } } },
  });
  return formatProject({ ...p, _count: { rules: 0, members: 1 } }, t, 'ADMIN');
}

export async function updateProject(id: string, data: { name?: string; description?: string; visibility?: string }, userId: string, t: TenantCtx) {
  const p = await prisma.project.findFirst({ where: { workspaceId: t.id, OR: [{ id }, { slug: id }] } });
  if (!p) throw new NotFoundError('Project');
  const visibility = data.visibility?.toUpperCase();
  if (visibility && !VIS.includes(visibility)) throw new ValidationError('Visibility must be WORKSPACE or PRIVATE');
  const u = await prisma.project.update({
    where: { id: p.id },
    data: { name: data.name?.trim() || p.name, description: data.description !== undefined ? data.description : p.description, ...(visibility && { visibility }) },
  });
  return formatProject({ ...u, _count: { rules: 0 } }, t, await projectRoleFor(userId, u, t.role));
}

export async function deleteProject(id: string, t: TenantCtx) {
  const p = await prisma.project.findFirst({ where: { workspaceId: t.id, OR: [{ id }, { slug: id }] } });
  if (!p) throw new NotFoundError('Project');
  await prisma.project.delete({ where: { id: p.id } });
}

/** Every tenant member with their effective role on the project (explicit row or inherited). */
export async function listProjectMembers(id: string, t: TenantCtx) {
  const p = await prisma.project.findFirst({ where: { workspaceId: t.id, OR: [{ id }, { slug: id }] } });
  if (!p) throw new NotFoundError('Project');
  const [tm, pm] = await Promise.all([
    prisma.workspaceMember.findMany({ where: { workspaceId: t.id }, include: { user: true }, orderBy: { createdAt: 'asc' } }),
    prisma.projectMember.findMany({ where: { projectId: p.id } }),
  ]);
  const explicit = new Map(pm.map(m => [m.userId, m.role]));
  return tm.map(m => {
    const tenantAdmin = m.role === 'OWNER' || m.role === 'ADMIN';
    const own = explicit.get(m.userId) as ProjectRole | undefined;
    const effective: ProjectRole | null = tenantAdmin ? 'ADMIN' : own ?? (p.visibility === 'PRIVATE' ? null : m.role === 'VIEWER' ? 'VIEWER' : 'EDITOR');
    return { userId: m.userId, name: m.user.name, email: m.user.email, tenantRole: m.role, projectRole: own ?? null, effectiveRole: effective,
      source: tenantAdmin ? 'tenant-admin' : own ? 'project' : effective ? 'tenant' : 'none' };
  });
}

/** role = null removes the explicit project role (falls back to tenant role / visibility). */
export async function setProjectMember(id: string, userId: string, role: string | null, t: TenantCtx) {
  const p = await prisma.project.findFirst({ where: { workspaceId: t.id, OR: [{ id }, { slug: id }] } });
  if (!p) throw new NotFoundError('Project');
  const tm = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: t.id, userId } } });
  if (!tm) throw new ValidationError('User is not a member of this tenant');
  if (role === null) { await prisma.projectMember.deleteMany({ where: { projectId: p.id, userId } }); return { userId, projectRole: null }; }
  const r = role.toUpperCase() as ProjectRole;
  if (!PROLES.includes(r)) throw new ValidationError('Role must be ADMIN, EDITOR or VIEWER');
  await prisma.projectMember.upsert({ where: { projectId_userId: { projectId: p.id, userId } }, update: { role: r }, create: { projectId: p.id, userId, role: r } });
  return { userId, projectRole: r };
}
