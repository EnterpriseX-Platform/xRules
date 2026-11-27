// Value sets: the possible values of a word — code · label · extra columns, and named groups of codes.
// Several words can use one set. Saving bumps the version; rules keep the codes they store.
import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from '../services/_access.js';
import type { AuthUser } from '../middleware/auth.js';

type Row = { code: string; label: string; extra?: Record<string, any> };

function clean(data: any) {
  const name = String(data?.name || '').trim(); if (!name) throw new ValidationError('A value set needs a name');
  const columns: string[] = Array.from(new Set<string>((data.columns || []).map((c: any) => String(c).trim()).filter(Boolean)));
  const rows: Row[] = (data.rows || []).map((r: any) => ({ code: String(r?.code ?? '').trim(), label: String(r?.label ?? r?.code ?? '').trim(),
    extra: Object.fromEntries(columns.map(c => { const v = r?.extra?.[c]; const n = Number(v); return [c, v === '' || v == null ? null : !isNaN(n) && String(v).trim() !== '' ? n : v]; })) })).filter((r: Row) => r.code);
  const dup = rows.map(r => r.code).filter((c, i, a) => a.indexOf(c) !== i);
  if (dup.length) throw new ValidationError(`Code ${dup[0]} is listed twice`);
  const groups: Record<string, string[]> = {};
  for (const [g, codes] of Object.entries(data.groups || {})) { const k = String(g).trim(); if (k) groups[k] = (codes as any[]).map(String).filter(c => rows.some(r => r.code === c)); }
  if (rows.length > 20000) throw new ValidationError('At most 20,000 values');
  return { name, columns, rows, groups };
}

export async function listSets(projectIdOrSlug: string, user: AuthUser) {
  const p = await assertProjectAccess(projectIdOrSlug, user);
  const [sets, words] = await Promise.all([
    prisma.valueSet.findMany({ where: { projectId: p.id, deletedAt: null }, orderBy: { name: 'asc' } }),
    prisma.vocabularyTerm.findMany({ where: { projectId: p.id, deletedAt: null, NOT: { valueSetId: null } }, select: { id: true, term: true, path: true, valueSetId: true } }),
  ]);
  return sets.map(s => ({ ...s, words: words.filter(w => w.valueSetId === s.id) }));
}
export async function saveSet(data: any, user: AuthUser) {
  const p = await assertProjectAccess(data.projectId, user, 'write');
  const f = clean(data);
  const clash = await prisma.valueSet.findFirst({ where: { projectId: p.id, name: f.name, deletedAt: null, ...(data.id ? { NOT: { id: data.id } } : {}) } });
  if (clash) throw new ValidationError(`"${f.name}" is already a value set`);
  if (data.id) {
    const s = await prisma.valueSet.findFirst({ where: { id: data.id, projectId: p.id } }); if (!s) throw new NotFoundError('Value set');
    return prisma.valueSet.update({ where: { id: s.id }, data: { ...f, rows: f.rows as any, groups: f.groups as any, deletedAt: null, version: s.version + 1 } });
  }
  return prisma.valueSet.create({ data: { projectId: p.id, ...f, rows: f.rows as any, groups: f.groups as any } });
}
export async function removeSet(id: string, user: AuthUser) {
  const s = await prisma.valueSet.findFirst({ where: { id, deletedAt: null } }); if (!s) throw new NotFoundError('Value set');
  await assertProjectAccess(s.projectId, user, 'write');
  await prisma.valueSet.update({ where: { id }, data: { deletedAt: new Date() } });
}
export async function restoreSet(id: string, user: AuthUser) {
  const s = await prisma.valueSet.findFirst({ where: { id } }); if (!s) throw new NotFoundError('Value set');
  await assertProjectAccess(s.projectId, user, 'write');
  return prisma.valueSet.update({ where: { id }, data: { deletedAt: null } });
}
/** Words on the set and the decisions that decide by those words. */
export async function setUsage(id: string, user: AuthUser) {
  const s = await prisma.valueSet.findFirst({ where: { id } }); if (!s) throw new NotFoundError('Value set');
  await assertProjectAccess(s.projectId, user);
  const words = await prisma.vocabularyTerm.findMany({ where: { projectId: s.projectId, deletedAt: null, valueSetId: id }, select: { id: true, term: true, path: true } });
  const paths = new Set(words.map(w => w.path));
  const rules = await prisma.rule.findMany({ where: { projectId: s.projectId }, select: { id: true, name: true, definition: true } });
  const used = rules.filter(r => ((r.definition as any)?.inputs || []).some((c: any) => paths.has(String(c?.name || '').replace(/^(any|all):/, ''))) ||
    JSON.stringify((r.definition as any)?.lines || []).match(new RegExp(words.map(w => w.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') || '^$')));
  return { words, decisions: used.map(r => ({ id: r.id, name: r.name, href: `/p/${s.projectId}/rules/${r.id}` })) };
}
