// Folder tree (max 5 levels) under a Project. Holds rules + flows.
import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from './_access.js';
import type { AuthUser } from '../middleware/auth.js';

const MAX_DEPTH = 5;

const fmt = (f: any) => ({
  id: f.id, name: f.name, position: f.position,
  projectId: f.projectId, parentId: f.parentId,
  childCount: f._count?.children ?? f.children?.length ?? 0,
  ruleCount: f._count?.rules ?? f.rules?.length ?? 0,
  flowCount: f._count?.flows ?? f.flows?.length ?? 0,
  createdAt: f.createdAt.toISOString(), updatedAt: f.updatedAt.toISOString(),
});

async function depthOf(folderId: string | null): Promise<number> {
  if (!folderId) return 0;
  let id: string | null = folderId;
  let depth = 0;
  while (id) {
    const f: { parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id }, select: { parentId: true },
    });
    if (!f) break;
    depth++;
    if (depth > 100) throw new Error('Folder cycle detected');
    id = f.parentId;
  }
  return depth;
}

export async function tree(projectId: string, user: AuthUser) {
  await assertProjectAccess(projectId, user);
  const flat = await prisma.folder.findMany({
    where: { projectId },
    include: { _count: { select: { rules: true, flows: true, children: true } } },
    orderBy: [{ parentId: 'asc' }, { position: 'asc' }],
  });
  // Build tree client-side from flat list — keep API simple, fast
  const nodes = flat.map(fmt);
  const byParent = new Map<string | null, any[]>();
  for (const n of nodes) {
    const list = byParent.get(n.parentId) ?? [];
    list.push({ ...n, children: [] });
    byParent.set(n.parentId, list);
  }
  function attach(parentId: string | null): any[] {
    return (byParent.get(parentId) || []).map(n => ({ ...n, children: attach(n.id) }));
  }
  return attach(null);
}

export async function create(
  data: { projectId: string; name: string; parentId?: string | null; position?: number },
  user: AuthUser,
) {
  if (!data.name) throw new ValidationError('name required');
  await assertProjectAccess(data.projectId, user, 'write');

  if (data.parentId) {
    const parent = await prisma.folder.findUnique({ where: { id: data.parentId } });
    if (!parent || parent.projectId !== data.projectId) throw new ValidationError('Parent must belong to same project');
    const d = await depthOf(data.parentId);
    if (d >= MAX_DEPTH) throw new ValidationError(`Folder depth limit reached (${MAX_DEPTH} levels)`);
  }

  const f = await prisma.folder.create({
    data: {
      name: data.name, projectId: data.projectId,
      parentId: data.parentId || null, position: data.position ?? 0,
    },
    include: { _count: { select: { rules: true, flows: true, children: true } } },
  });
  return fmt(f);
}

export async function rename(id: string, name: string, user: AuthUser) {
  if (!name) throw new ValidationError('name required');
  const f = await prisma.folder.findUnique({ where: { id } });
  if (!f) throw new NotFoundError('Folder');
  await assertProjectAccess(f.projectId, user, 'write');
  return fmt(await prisma.folder.update({
    where: { id }, data: { name },
    include: { _count: { select: { rules: true, flows: true, children: true } } },
  }));
}

export async function move(id: string, parentId: string | null, position: number | undefined, user: AuthUser) {
  const f = await prisma.folder.findUnique({ where: { id } });
  if (!f) throw new NotFoundError('Folder');
  await assertProjectAccess(f.projectId, user, 'write');

  if (parentId) {
    if (parentId === id) throw new ValidationError('Cannot move folder into itself');
    const parent = await prisma.folder.findUnique({ where: { id: parentId } });
    if (!parent || parent.projectId !== f.projectId) throw new ValidationError('Invalid parent');
    // Cycle check
    let cur: string | null = parent.id;
    while (cur) {
      if (cur === id) throw new ValidationError('Cycle detected — cannot move ancestor under descendant');
      const p: { parentId: string | null } | null = await prisma.folder.findUnique({
        where: { id: cur }, select: { parentId: true },
      });
      cur = p?.parentId ?? null;
    }
    const d = await depthOf(parentId);
    if (d >= MAX_DEPTH) throw new ValidationError(`Depth limit (${MAX_DEPTH})`);
  }

  return fmt(await prisma.folder.update({
    where: { id },
    data: { parentId, position: position ?? f.position },
    include: { _count: { select: { rules: true, flows: true, children: true } } },
  }));
}

export async function remove(id: string, user: AuthUser) {
  const f = await prisma.folder.findUnique({ where: { id } });
  if (!f) throw new NotFoundError('Folder');
  await assertProjectAccess(f.projectId, user, 'write');
  // Cascade deletes children due to relation onDelete: Cascade.
  await prisma.folder.delete({ where: { id } });
}

// Move a rule or flow into a folder (or to root by passing null).
export async function moveItem(
  kind: 'rule' | 'flow',
  itemId: string,
  folderId: string | null,
  user: AuthUser,
) {
  if (kind === 'rule') {
    const r = await prisma.rule.findUnique({ where: { id: itemId } });
    if (!r) throw new NotFoundError('Rule');
    await assertProjectAccess(r.projectId, user, 'write');
    if (folderId) {
      const folder = await prisma.folder.findUnique({ where: { id: folderId } });
      if (!folder || folder.projectId !== r.projectId) throw new ValidationError('Folder must be in same project');
    }
    await prisma.rule.update({ where: { id: itemId }, data: { folderId } });
  } else {
    const fl = await prisma.flow.findUnique({ where: { id: itemId } });
    if (!fl) throw new NotFoundError('Flow');
    await assertProjectAccess(fl.projectId, user, 'write');
    if (folderId) {
      const folder = await prisma.folder.findUnique({ where: { id: folderId } });
      if (!folder || folder.projectId !== fl.projectId) throw new ValidationError('Folder must be in same project');
    }
    await prisma.flow.update({ where: { id: itemId }, data: { folderId } });
  }
}

// Export folder + descendants + contained rules + flows as JSON bundle.
export async function exportBundle(id: string, user: AuthUser) {
  const f = await prisma.folder.findUnique({ where: { id } });
  if (!f) throw new NotFoundError('Folder');
  await assertProjectAccess(f.projectId, user);

  async function collect(folderId: string): Promise<any> {
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      include: { rules: true, flows: true, children: true },
    });
    if (!folder) return null;
    const children = await Promise.all((folder.children || []).map(c => collect(c.id)));
    return {
      name: folder.name,
      position: folder.position,
      rules: folder.rules,
      flows: folder.flows,
      children: children.filter(Boolean),
    };
  }

  return { version: '1.0', exportedAt: new Date().toISOString(), root: await collect(id) };
}
