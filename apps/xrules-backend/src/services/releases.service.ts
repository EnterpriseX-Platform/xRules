import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from './_access.js';
import type { AuthUser } from '../middleware/auth.js';

const fmt = (r: any) => ({
  id: r.id, name: r.name, description: r.description,
  // the list carries counts, not the full snapshot (GET /releases/:id/bundle or the export for that)
  manifest: { rules: r.manifest?.rules || [], flows: r.manifest?.flows || [], models: r.manifest?.models || [], full: !!r.manifest?.bundle, rolledBackFrom: r.manifest?.rolledBackFrom || null,
    counts: r.manifest?.bundle ? Object.fromEntries(Object.entries(r.manifest.bundle.parts || {}).map(([k, v]: any) => [k, v.length])) : null },
  status: r.status.toLowerCase(),
  projectId: r.projectId,
  createdById: r.createdById,
  createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
});

export async function list(projectIdOrSlug: string, user: AuthUser) {
  const project = await assertProjectAccess(projectIdOrSlug, user);
  const rows = await prisma.release.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'desc' } });
  return rows.map(fmt);
}

export async function get(id: string, user: AuthUser) {
  const r = await prisma.release.findUnique({ where: { id }, include: { pinnedIn: true } });
  if (!r) throw new NotFoundError('Release');
  await assertProjectAccess(r.projectId, user);
  return { ...fmt(r), pinnedIn: r.pinnedIn.map(e => ({ id: e.id, slug: e.slug, name: e.name })) };
}

export async function create(
  data: { projectId: string; name: string; description?: string; ruleSlugs?: string[]; rolledBackFrom?: string },
  user: AuthUser,
  opts: { skipAccess?: boolean } = {},
) {
  if (!data.projectId || !data.name) throw new ValidationError('projectId, name required');
  if (!opts.skipAccess) await assertProjectAccess(data.projectId, user, 'admin');

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
    // the whole configuration as it is now: compare, export and roll back from this; a release is never edited
    bundle: await (await import('../platform/ops.js')).snapshotFor(data.projectId, data.name),
    rolledBackFrom: data.rolledBackFrom || null,
  };

  const r = await prisma.release.create({
    data: {
      name: data.name, description: data.description, manifest: manifest as any,
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
