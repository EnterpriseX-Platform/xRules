import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { generateSlug } from '../utils/slug.js';
import { assertProjectAccess } from './_access.js';
import type { AuthUser } from '../middleware/auth.js';

function format(d: any) {
  return {
    id: d.id, name: d.name, slug: d.slug, format: d.format,
    rowCount: d.rowCount, schema: d.schema,
    inline: d.inline, uri: d.uri,
    projectId: d.projectId,
    createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString(),
  };
}

export async function list(projectId: string, user: AuthUser) {
  await assertProjectAccess(projectId, user);
  const rows = await prisma.dataset.findMany({ where: { projectId }, orderBy: { updatedAt: 'desc' } });
  return rows.map(format);
}

export async function get(id: string, user: AuthUser) {
  const d = await prisma.dataset.findUnique({ where: { id } });
  if (!d) throw new NotFoundError('Dataset');
  await assertProjectAccess(d.projectId, user);
  return format(d);
}

export async function create(
  data: { name: string; projectId: string; format?: string; inline?: any; uri?: string; schema?: any },
  user: AuthUser,
) {
  if (!data.name || !data.projectId) throw new ValidationError('name, projectId required');
  await assertProjectAccess(data.projectId, user, 'write');
  const baseSlug = generateSlug(data.name);
  let slug = baseSlug, counter = 1;
  while (await prisma.dataset.findUnique({ where: { projectId_slug: { projectId: data.projectId, slug } } })) {
    slug = `${baseSlug}-${counter}`; counter++;
  }
  const rowCount = Array.isArray(data.inline) ? data.inline.length : 0;
  const d = await prisma.dataset.create({
    data: {
      name: data.name, slug, format: data.format || 'jsonl',
      inline: data.inline, uri: data.uri, schema: data.schema, rowCount,
      projectId: data.projectId,
    },
  });
  return format(d);
}

export async function update(id: string, data: any, user: AuthUser) {
  const d = await prisma.dataset.findUnique({ where: { id } });
  if (!d) throw new NotFoundError('Dataset');
  await assertProjectAccess(d.projectId, user, 'write');
  const update: any = {};
  for (const k of ['name', 'format', 'inline', 'uri', 'schema']) if (data[k] !== undefined) update[k] = data[k];
  if (data.inline) update.rowCount = Array.isArray(data.inline) ? data.inline.length : 0;
  return format(await prisma.dataset.update({ where: { id }, data: update }));
}

export async function remove(id: string, user: AuthUser) {
  const d = await prisma.dataset.findUnique({ where: { id } });
  if (!d) throw new NotFoundError('Dataset');
  await assertProjectAccess(d.projectId, user, 'write');
  await prisma.dataset.delete({ where: { id } });
}
