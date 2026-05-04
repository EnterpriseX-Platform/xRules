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

export async function assertProjectAccess(projectId: string, user: AuthUser, perm: Permission = 'read') {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError('Project');
  await assertWorkspaceAccess(project.workspaceId, user, perm);
  return project;
}
