// Current tenant (from X-Tenant) — settings and members.
import { Router, type Request, type Response, type NextFunction } from 'express';
import { prisma } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';

const r = Router();
const ROLES = ['OWNER', 'ADMIN', 'INTEGRATOR', 'MEMBER', 'VIEWER'] as const;
const h = (fn: (req: Request, res: Response) => Promise<any>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const isAdmin = (req: Request) => req.tenant!.role === 'OWNER' || req.tenant!.role === 'ADMIN';
function needAdmin(req: Request) { if (!isAdmin(req)) throw new ForbiddenError('Tenant owner or admin only'); }

r.use(authMiddleware);

r.get('/', h(async (req, res) => {
  const t = req.tenant!;
  const w = await prisma.workspace.findUnique({ where: { id: t.id }, include: { _count: { select: { projects: true, members: true, apiKeys: true } } } });
  const perms = { admin: t.role === 'OWNER' || t.role === 'ADMIN', integrate: ['OWNER', 'ADMIN', 'INTEGRATOR'].includes(t.role), write: t.role !== 'VIEWER', approve: !!t.canApprove, tune: !!t.canTune };
  res.json({ success: true, data: { id: w!.id, slug: w!.slug, name: w!.name, description: w!.description, plan: w!.plan.toLowerCase(), role: t.role, perms, environment: (process.env.XRULES_ENV || 'UAT').toUpperCase(),
    requireApproval: (w!.settings as any)?.requireApproval !== false, projectCount: w!._count.projects, memberCount: w!._count.members, apiKeyCount: w!._count.apiKeys, createdAt: w!.createdAt.toISOString() } });
}));

r.put('/', h(async (req, res) => {
  needAdmin(req);
  const { name, description, requireApproval } = req.body ?? {};
  if (name !== undefined && !String(name).trim()) throw new ValidationError('Name is required');
  const cur = await prisma.workspace.findUnique({ where: { id: req.tenant!.id }, select: { settings: true } });
  const settings = requireApproval === undefined ? undefined : { ...((cur?.settings as any) || {}), requireApproval: !!requireApproval };
  const w = await prisma.workspace.update({ where: { id: req.tenant!.id }, data: { ...(name !== undefined && { name: String(name).trim() }), ...(description !== undefined && { description }), ...(settings && { settings }) } });
  res.json({ success: true, data: { id: w.id, slug: w.slug, name: w.name, description: w.description, requireApproval: (w.settings as any)?.requireApproval !== false } });
}));

r.get('/members', h(async (req, res) => {
  const ms = await prisma.workspaceMember.findMany({ where: { workspaceId: req.tenant!.id }, include: { user: true }, orderBy: { createdAt: 'asc' } });
  res.json({ success: true, data: ms.map(m => ({ userId: m.userId, name: m.user.name, email: m.user.email, role: m.role, canApprove: m.canApprove || m.role === 'OWNER' || m.role === 'ADMIN', canTune: (m as any).canTune || m.role === 'OWNER' || m.role === 'ADMIN', joinedAt: m.createdAt.toISOString() })) });
}));

async function owners(workspaceId: string) { return prisma.workspaceMember.count({ where: { workspaceId, role: 'OWNER' } }); }

r.post('/members', h(async (req, res) => {
  needAdmin(req);
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const role = String(req.body?.role ?? 'MEMBER').toUpperCase() as typeof ROLES[number];
  if (!email) throw new ValidationError('Email is required');
  if (!ROLES.includes(role)) throw new ValidationError(`Role must be one of ${ROLES.join(', ')}`);
  if (role === 'OWNER' && req.tenant!.role !== 'OWNER') throw new ForbiddenError('Only an owner can add owners');
  let user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
  let tempPassword: string | undefined;
  if (!user) {
    const { tempPassword: gen } = await import('../services/admin.service.js');
    const bcrypt = (await import('bcryptjs')).default;
    tempPassword = gen();
    user = await prisma.user.create({ data: { email, name: email.split('@')[0], password: await bcrypt.hash(tempPassword, 10) } });
  }
  const exists = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: req.tenant!.id, userId: user.id } } });
  if (exists) throw new ValidationError(`${email} is already a member`);
  if (!tempPassword) await (await import('../services/admin.service.js')).assertNoOtherOrg(user.id, email);
  const m = await prisma.workspaceMember.create({ data: { workspaceId: req.tenant!.id, userId: user.id, role } });
  res.status(201).json({ success: true, data: { userId: user.id, name: user.name, email: user.email, role: m.role, tempPassword } });
}));

r.put('/members/:userId', h(async (req, res) => {
  needAdmin(req);
  const t = req.tenant!;
  const m = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: t.id, userId: req.params.userId } } });
  if (!m) throw new NotFoundError('Member');
  const data: any = {};
  if (req.body?.role !== undefined) {
    const role = String(req.body.role).toUpperCase() as typeof ROLES[number];
    if (!ROLES.includes(role)) throw new ValidationError(`Role must be one of ${ROLES.join(', ')}`);
    if ((m.role === 'OWNER' || role === 'OWNER') && t.role !== 'OWNER') throw new ForbiddenError('Only an owner can change owners');
    if (m.role === 'OWNER' && role !== 'OWNER' && (await owners(t.id)) <= 1) throw new ValidationError('A tenant needs at least one owner');
    data.role = role;
  }
  if (req.body?.canApprove !== undefined) data.canApprove = !!req.body.canApprove;
  if (req.body?.canTune !== undefined) data.canTune = !!req.body.canTune;
  const u = await prisma.workspaceMember.update({ where: { id: m.id }, data });
  res.json({ success: true, data: { userId: u.userId, role: u.role, canApprove: u.canApprove, canTune: (u as any).canTune } });
}));

r.delete('/members/:userId', h(async (req, res) => {
  const t = req.tenant!;
  const self = req.params.userId === req.user!.userId;
  if (!self) needAdmin(req);                       // anyone may leave; admins remove others
  const m = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: t.id, userId: req.params.userId } } });
  if (!m) throw new NotFoundError('Member');
  if (m.role === 'OWNER' && !self && t.role !== 'OWNER') throw new ForbiddenError('Only an owner can remove owners');
  if (m.role === 'OWNER' && (await owners(t.id)) <= 1) throw new ValidationError('A tenant needs at least one owner');
  const u = await prisma.user.findUnique({ where: { id: m.userId }, select: { email: true, name: true } });
  const access = await prisma.projectMember.findMany({ where: { userId: m.userId, project: { workspaceId: t.id } }, select: { projectId: true, role: true } });
  await prisma.$transaction([
    prisma.memberRemoval.create({ data: { workspaceId: t.id, userId: m.userId, email: u?.email || '', name: u?.name, role: m.role, canApprove: m.canApprove, projectAccess: access as any, removedBy: req.user!.userId } }),
    prisma.projectMember.deleteMany({ where: { userId: m.userId, project: { workspaceId: t.id } } }),
    prisma.workspaceMember.delete({ where: { id: m.id } }),
  ]);
  res.json({ success: true, data: { removed: m.userId } });
}));

r.get('/members/removed', h(async (req, res) => {
  needAdmin(req);
  const rows = await prisma.memberRemoval.findMany({ where: { workspaceId: req.tenant!.id, restoredAt: null }, orderBy: { removedAt: 'desc' }, take: 200 });
  const by = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map(r => r.removedBy))] } }, select: { id: true, email: true } });
  res.json({ success: true, data: rows.map(r => ({ id: r.id, userId: r.userId, email: r.email, name: r.name, role: r.role, removedAt: r.removedAt, removedBy: by.find(b => b.id === r.removedBy)?.email || null })) });
}));

r.post('/members/removed/:id/restore', h(async (req, res) => {
  needAdmin(req);
  const t = req.tenant!;
  const rec = await prisma.memberRemoval.findFirst({ where: { id: req.params.id, workspaceId: t.id, restoredAt: null } });
  if (!rec) throw new NotFoundError('Removed member');
  if (rec.role === 'OWNER' && t.role !== 'OWNER') throw new ForbiddenError('Only an owner can restore owners');
  await (await import('../services/admin.service.js')).assertNoOtherOrg(rec.userId, rec.email);
  const access = (rec.projectAccess as any[]) || [];
  const live = await prisma.project.findMany({ where: { id: { in: access.map(a => a.projectId) }, workspaceId: t.id }, select: { id: true } });
  await prisma.$transaction([
    prisma.workspaceMember.create({ data: { workspaceId: t.id, userId: rec.userId, role: rec.role as any, canApprove: rec.canApprove } }),
    ...access.filter(a => live.some(p => p.id === a.projectId)).map(a => prisma.projectMember.create({ data: { projectId: a.projectId, userId: rec.userId, role: a.role } })),
    prisma.memberRemoval.update({ where: { id: rec.id }, data: { restoredAt: new Date() } }),
  ]);
  res.json({ success: true, data: { restored: rec.userId } });
}));

export default r;
