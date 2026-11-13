// Current tenant (from X-Tenant) — settings and members.
import { Router, type Request, type Response, type NextFunction } from 'express';
import { prisma } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';

const r = Router();
const ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const;
const h = (fn: (req: Request, res: Response) => Promise<any>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const isAdmin = (req: Request) => req.tenant!.role === 'OWNER' || req.tenant!.role === 'ADMIN';
function needAdmin(req: Request) { if (!isAdmin(req)) throw new ForbiddenError('Tenant owner or admin only'); }

r.use(authMiddleware);

r.get('/', h(async (req, res) => {
  const t = req.tenant!;
  const w = await prisma.workspace.findUnique({ where: { id: t.id }, include: { _count: { select: { projects: true, members: true, apiKeys: true } } } });
  res.json({ success: true, data: { id: w!.id, slug: w!.slug, name: w!.name, description: w!.description, plan: w!.plan.toLowerCase(), role: t.role,
    projectCount: w!._count.projects, memberCount: w!._count.members, apiKeyCount: w!._count.apiKeys, createdAt: w!.createdAt.toISOString() } });
}));

r.put('/', h(async (req, res) => {
  needAdmin(req);
  const { name, description } = req.body ?? {};
  if (name !== undefined && !String(name).trim()) throw new ValidationError('Name is required');
  const w = await prisma.workspace.update({ where: { id: req.tenant!.id }, data: { ...(name !== undefined && { name: String(name).trim() }), ...(description !== undefined && { description }) } });
  res.json({ success: true, data: { id: w.id, slug: w.slug, name: w.name, description: w.description } });
}));

r.get('/members', h(async (req, res) => {
  const ms = await prisma.workspaceMember.findMany({ where: { workspaceId: req.tenant!.id }, include: { user: true }, orderBy: { createdAt: 'asc' } });
  res.json({ success: true, data: ms.map(m => ({ userId: m.userId, name: m.user.name, email: m.user.email, role: m.role, joinedAt: m.createdAt.toISOString() })) });
}));

async function owners(workspaceId: string) { return prisma.workspaceMember.count({ where: { workspaceId, role: 'OWNER' } }); }

r.post('/members', h(async (req, res) => {
  needAdmin(req);
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const role = String(req.body?.role ?? 'MEMBER').toUpperCase() as typeof ROLES[number];
  if (!email) throw new ValidationError('Email is required');
  if (!ROLES.includes(role)) throw new ValidationError(`Role must be one of ${ROLES.join(', ')}`);
  if (role === 'OWNER' && req.tenant!.role !== 'OWNER') throw new ForbiddenError('Only an owner can add owners');
  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
  if (!user) throw new NotFoundError(`User ${email}`);
  const exists = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: req.tenant!.id, userId: user.id } } });
  if (exists) throw new ValidationError(`${email} is already a member`);
  const m = await prisma.workspaceMember.create({ data: { workspaceId: req.tenant!.id, userId: user.id, role } });
  res.status(201).json({ success: true, data: { userId: user.id, name: user.name, email: user.email, role: m.role } });
}));

r.put('/members/:userId', h(async (req, res) => {
  needAdmin(req);
  const t = req.tenant!;
  const role = String(req.body?.role ?? '').toUpperCase() as typeof ROLES[number];
  if (!ROLES.includes(role)) throw new ValidationError(`Role must be one of ${ROLES.join(', ')}`);
  const m = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: t.id, userId: req.params.userId } } });
  if (!m) throw new NotFoundError('Member');
  if ((m.role === 'OWNER' || role === 'OWNER') && t.role !== 'OWNER') throw new ForbiddenError('Only an owner can change owners');
  if (m.role === 'OWNER' && role !== 'OWNER' && (await owners(t.id)) <= 1) throw new ValidationError('A tenant needs at least one owner');
  const u = await prisma.workspaceMember.update({ where: { id: m.id }, data: { role } });
  res.json({ success: true, data: { userId: u.userId, role: u.role } });
}));

r.delete('/members/:userId', h(async (req, res) => {
  const t = req.tenant!;
  const self = req.params.userId === req.user!.userId;
  if (!self) needAdmin(req);                       // anyone may leave; admins remove others
  const m = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: t.id, userId: req.params.userId } } });
  if (!m) throw new NotFoundError('Member');
  if (m.role === 'OWNER' && !self && t.role !== 'OWNER') throw new ForbiddenError('Only an owner can remove owners');
  if (m.role === 'OWNER' && (await owners(t.id)) <= 1) throw new ValidationError('A tenant needs at least one owner');
  await prisma.$transaction([
    prisma.projectMember.deleteMany({ where: { userId: m.userId, project: { workspaceId: t.id } } }),
    prisma.workspaceMember.delete({ where: { id: m.id } }),
  ]);
  res.json({ success: true, data: { removed: m.userId } });
}));

export default r;
