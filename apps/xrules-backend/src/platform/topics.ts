// Business topics (เรื่อง): what business users open and work in. A topic groups the rules and decision flows
// that answer its questions, and reports their tests, approvals and live state in one place.
import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from '../services/_access.js';
import type { AuthUser } from '../middleware/auth.js';

// the three business questions, by rule type
export const QUESTION: Record<string, 'qualify' | 'amount' | 'choose'> = {
  DECISION_TABLE: 'qualify', DECISION_TREE: 'qualify', SCRIPT: 'qualify', LOOKUP: 'qualify',
  FORMULA: 'amount', SCORECARD: 'amount', MODEL_CALL: 'amount', AI_AGENT: 'amount',
};

async function testsFor(targetType: string, ids: string[]) {
  if (!ids.length) return new Map<string, { total: number; pass: number }>();
  const cases = await prisma.testCase.findMany({ where: { deletedAt: null, targetType, targetId: { in: ids } }, select: { targetId: true, lastStatus: true } });
  const m = new Map<string, { total: number; pass: number }>();
  for (const c of cases) { const k = c.targetId!; const v = m.get(k) || { total: 0, pass: 0 }; v.total++; if (c.lastStatus === 'PASS') v.pass++; m.set(k, v); }
  return m;
}

export async function list(projectIdOrSlug: string, user: AuthUser) {
  const p = await assertProjectAccess(projectIdOrSlug, user);
  const topics = await prisma.topic.findMany({ where: { projectId: p.id, deletedAt: null }, orderBy: { createdAt: 'asc' } });
  const rules = await prisma.rule.findMany({ where: { projectId: p.id, topicId: { in: topics.map(t => t.id) } }, select: { id: true, topicId: true, status: true, reviewState: true } });
  const flows = await prisma.flow.findMany({ where: { projectId: p.id, topicId: { in: topics.map(t => t.id) } }, select: { id: true, topicId: true, status: true, reviewState: true } });
  const rt = await testsFor('rule', rules.map(r => r.id)); const ft = await testsFor('decision_flow', flows.map(f => f.id));
  return topics.map(t => {
    const rs = rules.filter(r => r.topicId === t.id), fs = flows.filter(f => f.topicId === t.id);
    const tests = [...rs.map(r => rt.get(r.id)), ...fs.map(f => ft.get(f.id))].filter(Boolean) as { total: number; pass: number }[];
    const items = [...rs, ...fs];
    return { id: t.id, name: t.name, description: t.description, goal: t.goal, updatedAt: t.updatedAt,
      decisions: items.length, live: items.filter(i => String(i.status).toUpperCase() === 'PUBLISHED').length,
      inReview: items.filter(i => i.reviewState === 'PENDING').length,
      tests: { total: tests.reduce((a, b) => a + b.total, 0), pass: tests.reduce((a, b) => a + b.pass, 0) } };
  });
}

export async function get(id: string, user: AuthUser) {
  const t = await prisma.topic.findFirst({ where: { id, deletedAt: null } });
  if (!t) throw new NotFoundError('Topic');
  await assertProjectAccess(t.projectId, user);
  const rules = await prisma.rule.findMany({ where: { topicId: t.id }, select: { id: true, name: true, type: true, status: true, reviewState: true, version: true, updatedAt: true, definition: true }, orderBy: { createdAt: 'asc' } });
  const flows = await prisma.flow.findMany({ where: { topicId: t.id }, select: { id: true, name: true, status: true, reviewState: true, version: true, updatedAt: true, kind: true }, orderBy: { createdAt: 'asc' } });
  const rt = await testsFor('rule', rules.map(r => r.id)); const ft = await testsFor('decision_flow', flows.map(f => f.id));
  const decisions = [
    ...rules.map(r => ({ id: r.id, kind: 'rule' as const, name: r.name, type: r.type, question: QUESTION[String(r.type).toUpperCase()] || 'qualify', status: String(r.status).toLowerCase(), reviewState: r.reviewState, version: r.version, updatedAt: r.updatedAt, tests: rt.get(r.id) || { total: 0, pass: 0 }, definition: r.definition })),
    ...flows.map(f => ({ id: f.id, kind: 'flow' as const, name: f.name, type: 'FLOW', question: 'choose' as const, status: String(f.status).toLowerCase(), reviewState: f.reviewState, version: f.version, updatedAt: f.updatedAt, tests: ft.get(f.id) || { total: 0, pass: 0 }, definition: null })),
  ];
  return { id: t.id, projectId: t.projectId, name: t.name, description: t.description, goal: t.goal, createdAt: t.createdAt, updatedAt: t.updatedAt, decisions };
}

export async function create(data: { projectId: string; name: string; description?: string; goal?: string }, user: AuthUser) {
  const p = await assertProjectAccess(data.projectId, user, 'write');
  const name = String(data.name || '').trim(); if (!name) throw new ValidationError('A topic needs a name');
  return prisma.topic.create({ data: { projectId: p.id, name, description: data.description?.trim() || null, goal: data.goal?.trim() || null, createdById: user.userId } });
}

export async function update(id: string, data: { name?: string; description?: string; goal?: string }, user: AuthUser) {
  const t = await prisma.topic.findFirst({ where: { id, deletedAt: null } }); if (!t) throw new NotFoundError('Topic');
  await assertProjectAccess(t.projectId, user, 'write');
  return prisma.topic.update({ where: { id }, data: { ...(data.name !== undefined && { name: String(data.name).trim() || t.name }), ...(data.description !== undefined && { description: data.description }), ...(data.goal !== undefined && { goal: data.goal }) } });
}

/** Removing a topic stamps it; its rules and flows stay, unassigned. */
export async function remove(id: string, user: AuthUser) {
  const t = await prisma.topic.findFirst({ where: { id, deletedAt: null } }); if (!t) throw new NotFoundError('Topic');
  await assertProjectAccess(t.projectId, user, 'write');
  await prisma.topic.update({ where: { id }, data: { deletedAt: new Date() } });
  await prisma.rule.updateMany({ where: { topicId: id }, data: { topicId: null } });
  await prisma.flow.updateMany({ where: { topicId: id }, data: { topicId: null } });
  return { removed: id };
}

/** Put a rule or a decision flow into a topic (topicId null takes it out). */
export async function assign(data: { topicId: string | null; kind: 'rule' | 'flow'; id: string }, user: AuthUser) {
  if (data.topicId) { const t = await prisma.topic.findFirst({ where: { id: data.topicId, deletedAt: null } }); if (!t) throw new NotFoundError('Topic'); await assertProjectAccess(t.projectId, user, 'write'); }
  if (data.kind === 'rule') { const r = await prisma.rule.findUnique({ where: { id: data.id } }); if (!r) throw new NotFoundError('Rule'); await assertProjectAccess(r.projectId, user, 'write'); await prisma.rule.update({ where: { id: r.id }, data: { topicId: data.topicId } }); }
  else { const f = await prisma.flow.findUnique({ where: { id: data.id } }); if (!f) throw new NotFoundError('Flow'); await assertProjectAccess(f.projectId, user, 'write'); await prisma.flow.update({ where: { id: f.id }, data: { topicId: data.topicId } }); }
  return { ok: true };
}
