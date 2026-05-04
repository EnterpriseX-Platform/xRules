import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { generateSlug } from '../utils/slug.js';
import { assertProjectAccess } from './_access.js';
import type { AuthUser } from '../middleware/auth.js';

const fmt = (s: any) => ({
  id: s.id, name: s.name, slug: s.slug, description: s.description,
  input: s.input, context: s.context, tags: s.tags || [],
  projectId: s.projectId,
  createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(),
});

export async function list(projectId: string, user: AuthUser) {
  await assertProjectAccess(projectId, user);
  const rows = await prisma.scenario.findMany({ where: { projectId }, orderBy: { updatedAt: 'desc' } });
  return rows.map(fmt);
}

export async function create(
  data: { name: string; projectId: string; input: any; description?: string; context?: any; tags?: string[] },
  user: AuthUser,
) {
  if (!data.name || !data.projectId || !data.input) throw new ValidationError('name, projectId, input required');
  await assertProjectAccess(data.projectId, user, 'write');
  const baseSlug = generateSlug(data.name);
  let slug = baseSlug, counter = 1;
  while (await prisma.scenario.findUnique({ where: { projectId_slug: { projectId: data.projectId, slug } } })) {
    slug = `${baseSlug}-${counter}`; counter++;
  }
  const s = await prisma.scenario.create({
    data: {
      name: data.name, slug, description: data.description,
      input: data.input, context: data.context, tags: data.tags || [],
      projectId: data.projectId,
    },
  });
  return fmt(s);
}

export async function update(id: string, data: any, user: AuthUser) {
  const s = await prisma.scenario.findUnique({ where: { id } });
  if (!s) throw new NotFoundError('Scenario');
  await assertProjectAccess(s.projectId, user, 'write');
  const u: any = {};
  for (const k of ['name', 'description', 'input', 'context', 'tags']) if (data[k] !== undefined) u[k] = data[k];
  return fmt(await prisma.scenario.update({ where: { id }, data: u }));
}

export async function remove(id: string, user: AuthUser) {
  const s = await prisma.scenario.findUnique({ where: { id } });
  if (!s) throw new NotFoundError('Scenario');
  await assertProjectAccess(s.projectId, user, 'write');
  await prisma.scenario.delete({ where: { id } });
}
