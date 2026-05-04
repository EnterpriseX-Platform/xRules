import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { generateSlug } from '../utils/slug.js';
import { assertProjectAccess } from './_access.js';
import type { AuthUser } from '../middleware/auth.js';

const fmt = (e: any) => ({
  id: e.id, name: e.name, slug: e.slug, description: e.description,
  releaseId: e.releaseId,
  release: e.release ? { id: e.release.id, name: e.release.name, status: e.release.status.toLowerCase() } : null,
  overrides: e.overrides,
  projectId: e.projectId,
  createdAt: e.createdAt.toISOString(), updatedAt: e.updatedAt.toISOString(),
});

export async function list(projectId: string, user: AuthUser) {
  await assertProjectAccess(projectId, user);
  const rows = await prisma.environment.findMany({
    where: { projectId },
    include: { release: true },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(fmt);
}

export async function create(
  data: { projectId: string; name: string; slug?: string; description?: string },
  user: AuthUser,
) {
  if (!data.projectId || !data.name) throw new ValidationError('projectId, name required');
  await assertProjectAccess(data.projectId, user, 'admin');
  const slug = data.slug || generateSlug(data.name);
  const e = await prisma.environment.create({
    data: { name: data.name, slug, description: data.description, projectId: data.projectId },
  });
  return fmt(e);
}

export async function pinRelease(id: string, releaseId: string, user: AuthUser) {
  const env = await prisma.environment.findUnique({ where: { id } });
  if (!env) throw new NotFoundError('Environment');
  await assertProjectAccess(env.projectId, user, 'admin');
  const release = await prisma.release.findUnique({ where: { id: releaseId } });
  if (!release || release.projectId !== env.projectId) throw new ValidationError('Release does not belong to project');
  return fmt(await prisma.environment.update({
    where: { id }, data: { releaseId }, include: { release: true },
  }));
}

export async function remove(id: string, user: AuthUser) {
  const e = await prisma.environment.findUnique({ where: { id } });
  if (!e) throw new NotFoundError('Environment');
  await assertProjectAccess(e.projectId, user, 'admin');
  await prisma.environment.delete({ where: { id } });
}
