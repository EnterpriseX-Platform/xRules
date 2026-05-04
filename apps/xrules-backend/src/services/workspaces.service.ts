import { prisma } from '../config/database.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import { generateSlug } from '../utils/slug.js';
import type { AuthUser } from '../middleware/auth.js';

export async function listWorkspaces(user: AuthUser) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.userId },
    include: {
      workspace: {
        include: { _count: { select: { projects: true, members: true } } },
      },
    },
  });

  return memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    description: m.workspace.description,
    plan: m.workspace.plan.toLowerCase(),
    role: m.role,
    projectCount: m.workspace._count.projects,
    memberCount: m.workspace._count.members,
    createdAt: m.workspace.createdAt.toISOString(),
    updatedAt: m.workspace.updatedAt.toISOString(),
  }));
}

export async function getWorkspace(id: string, user: AuthUser) {
  const workspace = await prisma.workspace.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    include: {
      _count: { select: { projects: true, members: true } },
      members: { include: { user: true } },
    },
  });

  if (!workspace) {
    throw new NotFoundError('Workspace');
  }

  const membership = workspace.members.find((m) => m.userId === user.userId);
  if (!membership) {
    throw new ForbiddenError('Access denied');
  }

  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    description: workspace.description,
    plan: workspace.plan.toLowerCase(),
    settings: workspace.settings,
    role: membership.role,
    projectCount: workspace._count.projects,
    memberCount: workspace._count.members,
    members: workspace.members.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      createdAt: m.createdAt.toISOString(),
    })),
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
  };
}

export async function createWorkspace(data: { name: string; description?: string }, user: AuthUser) {
  if (!data.name) {
    throw new ValidationError('Workspace name is required');
  }

  const baseSlug = generateSlug(data.name);
  let slug = baseSlug;
  let counter = 1;
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  const workspace = await prisma.workspace.create({
    data: {
      name: data.name,
      slug,
      description: data.description,
      members: {
        create: { userId: user.userId, role: 'OWNER' },
      },
    },
  });

  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    description: workspace.description,
    plan: workspace.plan.toLowerCase(),
    role: 'OWNER',
    projectCount: 0,
    memberCount: 1,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
  };
}

export async function addMember(workspaceId: string, data: { email: string; role?: string }, user: AuthUser) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) {
    throw new NotFoundError('Workspace');
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: user.userId },
  });

  if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
    throw new ForbiddenError('Insufficient permissions');
  }

  const targetUser = await prisma.user.findUnique({ where: { email: data.email } });
  if (!targetUser) {
    throw new NotFoundError('User');
  }

  const existing = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: targetUser.id } },
  });

  if (existing) {
    throw new ValidationError('User is already a member');
  }

  const role = (data.role?.toUpperCase() || 'MEMBER') as any;

  const member = await prisma.workspaceMember.create({
    data: { workspaceId, userId: targetUser.id, role },
    include: { user: true },
  });

  return {
    id: member.id,
    userId: member.userId,
    name: member.user.name,
    email: member.user.email,
    role: member.role,
    createdAt: member.createdAt.toISOString(),
  };
}
