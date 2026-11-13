// Shared access-control helpers
import { prisma } from '../config/database.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';
import type { AuthUser } from '../middleware/auth.js';
import { projectRoleFor } from '../middleware/tenant.js';

export type Permission = 'read' | 'write' | 'admin';

const READ_ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'EDITOR'];
const WRITE_ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'EDITOR'];
const ADMIN_ROLES = ['OWNER', 'ADMIN'];

function rolesFor(perm: Permission): string[] {
  switch (perm) {
    case 'read':  return READ_ROLES;
    case 'write': return WRITE_ROLES;
    case 'admin': return ADMIN_ROLES;
  }
}

export async function assertWorkspaceAccess(workspaceId: string, user: AuthUser, perm: Permission = 'read') {
  if (!workspaceId) throw new ForbiddenError('Tenant is required');
  const m = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: user.userId },
  });
  if (!m) throw new ForbiddenError('Access denied');
  if (!rolesFor(perm).includes(m.role)) throw new ForbiddenError('Insufficient permissions');
  return m;
}

export async function assertProjectAccess(idOrSlug: string, user: AuthUser, perm: Permission = 'read') {
  // id, or slug inside a tenant the user belongs to (slugs are only unique per tenant)
  const candidates = await prisma.project.findMany({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], workspace: { members: { some: { userId: user.userId } } } },
  });
  const project = candidates.find(p => p.id === idOrSlug) ?? candidates[0];
  if (!project) throw new NotFoundError('Project');
  const m = await assertWorkspaceAccess(project.workspaceId, user, 'read');
  const role = await projectRoleFor(user.userId, project, m.role as any);
  if (!role) throw new NotFoundError('Project');
  const need = perm === 'admin' ? 3 : perm === 'write' ? 2 : 1;
  if (({ VIEWER: 1, EDITOR: 2, ADMIN: 3 } as const)[role] < need) throw new ForbiddenError('Insufficient permissions');
  return project;
}

// Resolve to canonical project id. Returns null if not found / no access.
export async function resolveProjectId(idOrSlug: string, user: AuthUser): Promise<string | null> {
  try {
    const p = await assertProjectAccess(idOrSlug, user);
    return p.id;
  } catch {
    return null;
  }
}
