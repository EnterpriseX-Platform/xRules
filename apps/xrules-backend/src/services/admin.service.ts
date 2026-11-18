// System level: organizations, all users, platform settings. Callers are system admins only.
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../config/database.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { generateSlug } from '../utils/slug.js';

export const tempPassword = () => 'Xr-' + crypto.randomBytes(6).toString('hex');

export async function assertSystemAdmin(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { isSystemAdmin: true, disabled: true } });
  if (!u?.isSystemAdmin || u.disabled) throw new ForbiddenError('System admins only');
}

const DEFAULTS: Record<string, any> = { allowSignup: true, defaultLlm: '' };
export async function getSettings() {
  const rows = await prisma.systemSetting.findMany();
  const out: any = { ...DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}
export async function setSettings(patch: Record<string, any>) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULTS)) continue;
    await prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  return getSettings();
}

export async function listOrgs() {
  const ws = await prisma.workspace.findMany({
    orderBy: { createdAt: 'asc' } as any,
    include: { _count: { select: { members: true, projects: true } }, members: { where: { role: 'OWNER' }, include: { user: { select: { email: true } } }, take: 1 } },
  });
  return ws.map(w => ({ id: w.id, name: w.name, slug: w.slug, suspended: w.suspended, members: w._count.members, projects: w._count.projects, owner: w.members[0]?.user.email || null }));
}

export async function createOrg(data: { name: string; ownerEmail: string }) {
  const name = String(data.name || '').trim(); const email = String(data.ownerEmail || '').trim().toLowerCase();
  if (!name || !email) throw new ValidationError('Name and owner email are required');
  let slug = generateSlug(name); const base = slug; let i = 1;
  while (await prisma.workspace.findUnique({ where: { slug } })) slug = `${base}-${i++}`;
  let user = await prisma.user.findUnique({ where: { email } });
  let password: string | undefined;
  if (!user) { password = tempPassword(); user = await prisma.user.create({ data: { email, name: email.split('@')[0], password: await bcrypt.hash(password, 10) } }); }
  const ws = await prisma.workspace.create({ data: { name, slug, members: { create: { userId: user.id, role: 'OWNER' } } } });
  return { id: ws.id, slug: ws.slug, ownerEmail: email, tempPassword: password };
}

export async function updateOrg(id: string, data: { suspended?: boolean; name?: string }) {
  const ws = await prisma.workspace.findUnique({ where: { id } });
  if (!ws) throw new NotFoundError('Organization');
  return prisma.workspace.update({ where: { id }, data: { ...(data.suspended !== undefined ? { suspended: !!data.suspended } : {}), ...(data.name ? { name: String(data.name) } : {}) } });
}

export async function listUsers() {
  const us = await prisma.user.findMany({
    orderBy: { email: 'asc' },
    select: { id: true, email: true, name: true, isSystemAdmin: true, disabled: true, workspaces: { select: { role: true, workspace: { select: { name: true, slug: true } } } } },
  });
  return us.map(u => ({ id: u.id, email: u.email, name: u.name, isSystemAdmin: u.isSystemAdmin, disabled: u.disabled, orgs: u.workspaces.map(w => ({ name: w.workspace.name, slug: w.workspace.slug, role: w.role })) }));
}

export async function updateUser(id: string, data: { disabled?: boolean; isSystemAdmin?: boolean }, me: string) {
  if (id === me && (data.disabled === true || data.isSystemAdmin === false)) throw new ValidationError('You cannot disable yourself or remove your own system admin rights');
  const patch: any = {};
  if (data.disabled !== undefined) patch.disabled = !!data.disabled;
  if (data.isSystemAdmin !== undefined) patch.isSystemAdmin = !!data.isSystemAdmin;
  await prisma.user.update({ where: { id }, data: patch });
  return { id, ...patch };
}

export async function resetPassword(id: string) {
  const password = tempPassword();
  await prisma.user.update({ where: { id }, data: { password: await bcrypt.hash(password, 10) } });
  return { id, tempPassword: password };
}
