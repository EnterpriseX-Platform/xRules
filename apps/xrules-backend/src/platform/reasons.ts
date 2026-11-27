// Reason codes: a project catalogue (code, text, outcome, priority) that decision lines raise with "add reason".
// The decision returns every code raised, the top one by priority (1 = most important) and its outcome.
import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from '../services/_access.js';
import type { AuthUser } from '../middleware/auth.js';

export const OUTCOMES = ['Decline', 'Refer', 'Approve'];

export async function list(projectIdOrSlug: string, user: AuthUser) {
  const p = await assertProjectAccess(projectIdOrSlug, user);
  return prisma.reasonCode.findMany({ where: { projectId: p.id, deletedAt: null }, orderBy: [{ priority: 'asc' }, { code: 'asc' }] });
}

export async function save(data: { id?: string; projectId: string; code: string; text: string; outcome?: string; priority?: number }, user: AuthUser) {
  const p = await assertProjectAccess(data.projectId, user, 'write');
  const code = String(data.code || '').trim(); const text = String(data.text || '').trim();
  if (!code || !text) throw new ValidationError('A reason needs a code and a text');
  const outcome = OUTCOMES.find(o => o.toLowerCase() === String(data.outcome || 'Decline').toLowerCase());
  if (!outcome) throw new ValidationError(`Outcome must be one of ${OUTCOMES.join(', ')}`);
  const priority = Number.isFinite(Number(data.priority)) ? Math.round(Number(data.priority)) : 100;
  const clash = await prisma.reasonCode.findFirst({ where: { projectId: p.id, code, deletedAt: null, ...(data.id ? { NOT: { id: data.id } } : {}) } });
  if (clash) throw new ValidationError(`${code} is already in the catalogue`);
  const fields = { code, text, outcome, priority };
  if (data.id) {
    const r = await prisma.reasonCode.findFirst({ where: { id: data.id, projectId: p.id, deletedAt: null } }); if (!r) throw new NotFoundError('Reason');
    return prisma.reasonCode.update({ where: { id: r.id }, data: fields });
  }
  return prisma.reasonCode.create({ data: { projectId: p.id, ...fields } });
}

/** Removing a reason stamps it; lines that raise it still return the code. */
export async function remove(id: string, user: AuthUser) {
  const r = await prisma.reasonCode.findFirst({ where: { id, deletedAt: null } }); if (!r) throw new NotFoundError('Reason');
  await assertProjectAccess(r.projectId, user, 'write');
  await prisma.reasonCode.update({ where: { id }, data: { deletedAt: new Date() } });
  return { removed: id };
}

export async function catalogue(projectId: string) {
  return prisma.reasonCode.findMany({ where: { projectId, deletedAt: null } });
}
