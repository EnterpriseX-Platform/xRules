import { prisma } from '../config/database.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import { generateSlug } from '../utils/slug.js';
import type { AuthUser } from '../middleware/auth.js';

function formatModel(model: any) {
  return {
    id: model.id,
    name: model.name,
    slug: model.slug,
    type: model.type.toLowerCase(),
    version: model.version,
    config: model.config,
    status: model.status.toLowerCase(),
    metadata: model.metadata,
    artifactUri: model.artifactUri,
    projectId: model.projectId,
    createdBy: model.createdBy ? {
      id: model.createdBy.id,
      name: model.createdBy.name,
      email: model.createdBy.email,
    } : undefined,
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt.toISOString(),
  };
}

async function assertProjectAccess(idOrSlug: string, user: AuthUser, write = false) {
  // Accept project id or slug
  const project = await prisma.project.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: { workspace: true },
  });
  if (!project) throw new NotFoundError('Project');

  const m = await prisma.workspaceMember.findFirst({
    where: { workspaceId: project.workspaceId, userId: user.userId },
  });
  if (!m) throw new ForbiddenError('Access denied');
  if (write && m.role !== 'OWNER' && m.role !== 'ADMIN' && m.role !== 'MEMBER') {
    throw new ForbiddenError('Insufficient permissions');
  }
  return project;
}

export async function listModels(projectIdOrSlug: string, user: AuthUser) {
  const project = await assertProjectAccess(projectIdOrSlug, user);
  const models = await prisma.model.findMany({
    where: { projectId: project.id },
    orderBy: { updatedAt: 'desc' },
    include: { createdBy: true },
  });
  return models.map(formatModel);
}

export async function getModel(id: string, user: AuthUser) {
  const model = await prisma.model.findUnique({
    where: { id },
    include: { project: { include: { workspace: true } }, createdBy: true },
  });
  if (!model) throw new NotFoundError('Model');
  await assertProjectAccess(model.projectId, user);
  return formatModel(model);
}

export async function createModel(
  data: {
    name: string;
    type: string;
    projectId: string;
    version?: string;
    config?: object;
    metadata?: object;
    artifactUri?: string;
  },
  user: AuthUser,
) {
  if (!data.name || !data.type || !data.projectId) {
    throw new ValidationError('name, type, projectId are required');
  }
  await assertProjectAccess(data.projectId, user, true);

  const baseSlug = generateSlug(data.name);
  let slug = baseSlug;
  let counter = 1;
  while (await prisma.model.findUnique({ where: { projectId_slug: { projectId: data.projectId, slug } } })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  const model = await prisma.model.create({
    data: {
      name: data.name,
      slug,
      type: data.type.toUpperCase() as any,
      version: data.version || '1.0.0',
      config: data.config || {},
      metadata: data.metadata || {},
      artifactUri: data.artifactUri,
      projectId: data.projectId,
      createdById: user.userId,
    },
    include: { createdBy: true },
  });
  return formatModel(model);
}

export async function updateModel(
  id: string,
  data: { name?: string; config?: object; metadata?: object; status?: string; version?: string; artifactUri?: string },
  user: AuthUser,
) {
  const model = await prisma.model.findUnique({ where: { id } });
  if (!model) throw new NotFoundError('Model');
  await assertProjectAccess(model.projectId, user, true);

  const updateData: any = {};
  if (data.name) updateData.name = data.name;
  if (data.config) updateData.config = data.config;
  if (data.metadata) updateData.metadata = data.metadata;
  if (data.status) updateData.status = data.status.toUpperCase();
  if (data.version) updateData.version = data.version;
  if (data.artifactUri !== undefined) updateData.artifactUri = data.artifactUri;

  const updated = await prisma.model.update({
    where: { id },
    data: updateData,
    include: { createdBy: true },
  });
  return formatModel(updated);
}

export async function deleteModel(id: string, user: AuthUser) {
  const model = await prisma.model.findUnique({ where: { id } });
  if (!model) throw new NotFoundError('Model');
  await assertProjectAccess(model.projectId, user, true);
  await prisma.model.delete({ where: { id } });
}
