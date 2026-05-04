import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from './_access.js';
import type { AuthUser } from '../middleware/auth.js';

const fmt = (r: any) => ({
  id: r.id, name: r.name, description: r.description,
  manifest: r.manifest, status: r.status.toLowerCase(),
  projectId: r.projectId,
  createdById: r.createdById,
  createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
});

export async function list(projectId: string, user: AuthUser) {
  await assertProjectAccess(projectId, user);
  const rows = await prisma.release.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } });
  return rows.map(fmt);
}

export async function get(id: string, user: AuthUser) {
  const r = await prisma.release.findUnique({ where: { id }, include: { pinnedIn: true } });
  if (!r) throw new NotFoundError('Release');
  await assertProjectAccess(r.projectId, user);
  return { ...fmt(r), pinnedIn: r.pinnedIn.map(e => ({ id: e.id, slug: e.slug, name: e.name })) };
}

export async function create(
  data: { projectId: string; name: string; description?: string; ruleSlugs?: string[] },
  user: AuthUser,
) {
  if (!data.projectId || !data.name) throw new ValidationError('projectId, name required');
  await assertProjectAccess(data.projectId, user, 'admin');

  // Snapshot rules: pick named or all PUBLISHED
  const ruleWhere: any = { projectId: data.projectId };
  if (data.ruleSlugs?.length) ruleWhere.slug = { in: data.ruleSlugs };
  const rules = await prisma.rule.findMany({ where: ruleWhere });
  const flows = await prisma.flow.findMany({ where: { projectId: data.projectId, status: 'PUBLISHED' } });
  const models = await prisma.model.findMany({ where: { projectId: data.projectId, status: 'ACTIVE' } });

  const manifest = {
    rules: rules.map(r => ({ ruleId: r.id, slug: r.slug, version: r.version })),
    flows: flows.map(f => ({ flowId: f.id, slug: f.slug, version: f.version })),
    models: models.map(m => ({ modelId: m.id, slug: m.slug, version: m.version })),
  };

  const r = await prisma.release.create({
    data: {
      name: data.name, description: data.description, manifest,
      status: 'PUBLISHED',
      projectId: data.projectId, createdById: user.userId,
    },
  });
  return fmt(r);
}

export async function revoke(id: string, user: AuthUser) {
  const r = await prisma.release.findUnique({ where: { id } });
  if (!r) throw new NotFoundError('Release');
  await assertProjectAccess(r.projectId, user, 'admin');
  return fmt(await prisma.release.update({ where: { id }, data: { status: 'REVOKED' } }));
}
