import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { generateSlug } from '../utils/slug.js';
import { assertProjectAccess } from './_access.js';
import type { AuthUser } from '../middleware/auth.js';

function format(flow: any) {
  return {
    id: flow.id,
    name: flow.name,
    slug: flow.slug,
    alias: flow.alias,
    description: flow.description,
    kind: (flow.kind || 'DECISION').toLowerCase(),
    schedule: flow.schedule ?? null,
    lastRunAt: flow.lastRunAt ? flow.lastRunAt.toISOString() : null,
    locked: flow.locked || false,
    folderId: flow.folderId,
    graph: flow.graph,
    inputSchema: flow.inputSchema,
    outputSchema: flow.outputSchema,
    tags: flow.tags || [],
    status: flow.status.toLowerCase(),
    version: flow.version,
    projectId: flow.projectId,
    createdAt: flow.createdAt.toISOString(),
    updatedAt: flow.updatedAt.toISOString(),
  };
}

export async function listFlows(projectIdOrSlug: string, user: AuthUser, status?: string, kind?: string) {
  const project = await assertProjectAccess(projectIdOrSlug, user);
  const where: any = { projectId: project.id };
  if (status) where.status = status.toUpperCase();
  if (kind) where.kind = kind.toUpperCase();
  const flows = await prisma.flow.findMany({ where, orderBy: { updatedAt: 'desc' } });
  return flows.map(format);
}

export async function getFlow(id: string, user: AuthUser) {
  const flow = await prisma.flow.findUnique({ where: { id } });
  if (!flow) throw new NotFoundError('Flow');
  await assertProjectAccess(flow.projectId, user);
  return format(flow);
}

export async function createFlow(
  data: { name: string; projectId: string; description?: string; graph?: any; inputSchema?: any; outputSchema?: any; tags?: string[] },
  user: AuthUser,
) {
  if (!data.name || !data.projectId) throw new ValidationError('name, projectId required');
  await assertProjectAccess(data.projectId, user, 'write');
  const baseSlug = generateSlug(data.name);
  let slug = baseSlug;
  let counter = 1;
  while (await prisma.flow.findUnique({ where: { projectId_slug: { projectId: data.projectId, slug } } })) {
    slug = `${baseSlug}-${counter}`; counter++;
  }
  let alias = baseSlug;
  let aliasCounter = 1;
  while (await prisma.flow.findUnique({ where: { projectId_alias: { projectId: data.projectId, alias } } })) {
    alias = `${baseSlug}-${aliasCounter}`; aliasCounter++;
  }
  const kind = ((data as any).kind || 'DECISION').toUpperCase() as any;
  const flow = await prisma.flow.create({
    data: {
      name: data.name,
      slug, alias, kind,
      description: data.description,
      graph: data.graph || { nodes: [], edges: [] },
      inputSchema: data.inputSchema,
      outputSchema: data.outputSchema,
      tags: data.tags || [],
      schedule: (data as any).schedule,
      projectId: data.projectId,
      folderId: (data as any).folderId,
    },
  });
  return format(flow);
}

export async function updateFlow(id: string, data: any, user: AuthUser) {
  const flow = await prisma.flow.findUnique({ where: { id } });
  if (!flow) throw new NotFoundError('Flow');
  await assertProjectAccess(flow.projectId, user, 'write');
  const update: any = {};
  for (const key of ['name', 'description', 'graph', 'inputSchema', 'outputSchema', 'tags', 'schedule']) {
    if (data[key] !== undefined) update[key] = data[key];
  }
  if (data.status) update.status = data.status.toUpperCase();
  const updated = await prisma.flow.update({ where: { id }, data: update });
  return format(updated);
}

export async function deleteFlow(id: string, user: AuthUser) {
  const flow = await prisma.flow.findUnique({ where: { id } });
  if (!flow) throw new NotFoundError('Flow');
  await assertProjectAccess(flow.projectId, user, 'write');
  await prisma.flow.delete({ where: { id } });
}

export async function publishFlow(id: string, message: string | undefined, user: AuthUser) {
  const flow = await prisma.flow.findUnique({ where: { id } });
  if (!flow) throw new NotFoundError('Flow');
  await assertProjectAccess(flow.projectId, user, 'write');
  const nextVersion = flow.version + 1;
  const [, updated] = await prisma.$transaction([
    prisma.flowVersion.create({
      data: {
        flowId: id,
        version: nextVersion,
        graph: flow.graph as any,
        inputSchema: flow.inputSchema as any,
        outputSchema: flow.outputSchema as any,
        status: 'PUBLISHED',
        message,
      },
    }),
    prisma.flow.update({
      where: { id },
      data: { status: 'PUBLISHED', version: nextVersion },
    }),
  ]);
  return format(updated);
}
