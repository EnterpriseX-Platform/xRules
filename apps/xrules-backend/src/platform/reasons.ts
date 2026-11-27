// Reason codes: a project catalogue (code, text, outcome, priority) that decision lines raise with "add reason".
// The decision returns every code raised, the top one by priority (1 = most important) and its outcome.
import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from '../services/_access.js';
import type { AuthUser } from '../middleware/auth.js';

// Suggested outcomes; a project may use its own (Reject, Cancel, Pending, …).
export const OUTCOMES = ['Decline', 'Refer', 'Approve', 'Reject', 'Cancel', 'Pending'];
const outcomeOf = (v: unknown) => {
  const o = String(v ?? '').trim() || 'Decline';
  if (o.length > 40) throw new ValidationError('Outcome is at most 40 characters');
  return OUTCOMES.find(x => x.toLowerCase() === o.toLowerCase()) || o;
};
const resultOf = (v: unknown) => { const o = String(v ?? '').trim(); if (o.length > 40) throw new ValidationError('Result is at most 40 characters'); return o ? OUTCOMES.find(x => x.toLowerCase() === o.toLowerCase()) || o : null; };
const priorityOf = (v: unknown) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? 100 : Math.round(Number(v)));

export async function list(projectIdOrSlug: string, user: AuthUser) {
  const p = await assertProjectAccess(projectIdOrSlug, user);
  return prisma.reasonCode.findMany({ where: { projectId: p.id, deletedAt: null }, orderBy: [{ priority: 'asc' }, { code: 'asc' }] });
}

export async function save(data: { id?: string; projectId: string; code: string; text: string; outcome?: string; result?: string | null; priority?: number }, user: AuthUser) {
  const p = await assertProjectAccess(data.projectId, user, 'write');
  const code = String(data.code || '').trim(); const text = String(data.text || '').trim();
  if (!code || !text) throw new ValidationError('A reason needs a code and a text');
  const outcome = outcomeOf(data.outcome);
  const priority = priorityOf(data.priority);
  const clash = await prisma.reasonCode.findFirst({ where: { projectId: p.id, code, deletedAt: null, ...(data.id ? { NOT: { id: data.id } } : {}) } });
  if (clash) throw new ValidationError(`${code} is already in the catalogue`);
  const fields = { code, text, outcome, result: resultOf(data.result), priority };
  if (data.id) {
    const r = await prisma.reasonCode.findFirst({ where: { id: data.id, projectId: p.id, deletedAt: null } }); if (!r) throw new NotFoundError('Reason');
    return prisma.reasonCode.update({ where: { id: r.id }, data: fields });
  }
  return prisma.reasonCode.create({ data: { projectId: p.id, ...fields } });
}

/** Many reasons in one call (import): a code already in the catalogue is updated, a new one added. */
export async function bulk(data: { projectId: string; rows: { code: string; text: string; outcome?: string; result?: string | null; priority?: number | string }[] }, user: AuthUser) {
  const p = await assertProjectAccess(data.projectId, user, 'write');
  const rows = (Array.isArray(data.rows) ? data.rows : []).map((r, i) => {
    const code = String(r?.code ?? '').trim(); const text = String(r?.text ?? '').trim();
    if (!code || !text) throw new ValidationError(`Row ${i + 1}: a reason needs a code and a text`);
    return { code, text, outcome: outcomeOf(r.outcome), result: resultOf(r.result), priority: priorityOf(r.priority) };
  });
  if (!rows.length) throw new ValidationError('Nothing to import');
  if (rows.length > 2000) throw new ValidationError('At most 2,000 reasons in one import');
  const dup = rows.find((r, i) => rows.findIndex(x => x.code === r.code) !== i);
  if (dup) throw new ValidationError(`${dup.code} is in the import twice`);
  const have = await prisma.reasonCode.findMany({ where: { projectId: p.id, deletedAt: null } });
  let created = 0, updated = 0;
  await prisma.$transaction(rows.map(r => {
    const h = have.find(x => x.code === r.code);
    if (h) { updated++; return prisma.reasonCode.update({ where: { id: h.id }, data: r }); }
    created++; return prisma.reasonCode.create({ data: { projectId: p.id, ...r } });
  }));
  return { created, updated };
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
