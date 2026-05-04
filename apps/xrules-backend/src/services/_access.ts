// Shared access-control helpers
import { prisma } from '../config/database.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';
import type { AuthUser } from '../middleware/auth.js';

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
  const m = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: user.userId },
  });
  if (!m) throw new ForbiddenError('Access denied');
  if (!rolesFor(perm).includes(m.role)) throw new ForbiddenError('Insufficient permissions');
  return m;
}

export async function assertProjectAccess(idOrSlug: string, user: AuthUser, perm: Permission = 'read') {
  // Accept project id, slug, or alias-style identifier.
  const project = await prisma.project.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
  });
  if (!project) throw new NotFoundError('Project');
  await assertWorkspaceAccess(project.workspaceId, user, perm);
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
