import { prisma } from '../config/database.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import { generateSlug } from '../utils/slug.js';
import type { AuthUser } from '../middleware/auth.js';

function formatProject(project: any, workspace: any) {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description,
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    status: 'active' as const,
    ruleCount: project._count?.rules ?? 0,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export async function listProjects(workspaceSlug: string, user: AuthUser) {
  const workspace = await prisma.workspace.findUnique({
    where: { slug: workspaceSlug },
    include: {
      projects: {
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { rules: true } } },
      },
    },
  });

  if (!workspace) {
    throw new NotFoundError('Workspace');
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: workspace.id, userId: user.userId },
  });
  if (!membership) {
    throw new ForbiddenError('Access denied');
  }

  return workspace.projects.map((p) => formatProject(p, workspace));
}

export async function getProject(id: string, user: AuthUser) {
  const project = await prisma.project.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    include: { workspace: true, _count: { select: { rules: true } } },
  });

  if (!project) {
    throw new NotFoundError('Project');
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: project.workspaceId, userId: user.userId },
  });

  if (!membership) {
    throw new ForbiddenError('Access denied');
  }

  return formatProject(project, project.workspace);
}

export async function createProject(data: { name: string; description?: string; workspaceSlug?: string }, user: AuthUser) {
  const workspaceSlug = data.workspaceSlug || user.tenantId;
  const workspace = await prisma.workspace.findUnique({
    where: { slug: workspaceSlug || undefined },
  });

  if (!workspace) {
    throw new NotFoundError('Workspace');
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: workspace.id, userId: user.userId },
  });

  if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
    throw new ForbiddenError('Insufficient permissions');
  }

  const baseSlug = generateSlug(data.name);
  let slug = baseSlug;
  let counter = 1;
  while (await prisma.project.findUnique({ where: { workspaceId_slug: { workspaceId: workspace.id, slug } } })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  const project = await prisma.project.create({
    data: { name: data.name, slug, description: data.description, workspaceId: workspace.id },
  });

  return { ...formatProject({ ...project, _count: { rules: 0 } }, workspace) };
}

export async function updateProject(id: string, data: { name?: string; description?: string }, user: AuthUser) {
  const project = await prisma.project.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    include: { workspace: true },
  });

  if (!project) {
    throw new NotFoundError('Project');
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: project.workspaceId, userId: user.userId },
  });

  if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
    throw new ForbiddenError('Insufficient permissions');
  }

  const updated = await prisma.project.update({
    where: { id: project.id },
    data: {
      name: data.name || project.name,
      description: data.description !== undefined ? data.description : project.description,
    },
  });

  return formatProject({ ...updated, _count: { rules: 0 } }, project.workspace);
}

export async function deleteProject(id: string, user: AuthUser) {
  const project = await prisma.project.findFirst({
    where: { OR: [{ id }, { slug: id }] },
  });

  if (!project) {
    throw new NotFoundError('Project');
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: project.workspaceId, userId: user.userId },
  });

  if (!membership || membership.role !== 'OWNER') {
    throw new ForbiddenError('Only workspace owner can delete projects');
  }

  await prisma.project.delete({ where: { id: project.id } });
}
