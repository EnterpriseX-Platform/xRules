// Home by role: business users see their topics and failing tests, approvers the changes waiting for them,
// developers the data requests and API errors. One call, filtered to what the caller may see.
import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from '../services/_access.js';
import type { AuthUser } from '../middleware/auth.js';
import { testsFor } from './topics.js';

async function projectIds(user: AuthUser) {
  const t: any = (user as any).tenant;
  const ps = await prisma.project.findMany({ where: t ? { workspaceId: t.id } : {}, select: { id: true, name: true } });
  return ps;
}

export async function home(user: AuthUser) {
  const ps = await projectIds(user); const ids = ps.map(p => p.id); const pname = new Map(ps.map(p => [p.id, p.name]));
  const me = user.email || user.userId;
  const [topics, failing, reviews, mine, requests, errors] = await Promise.all([
    prisma.topic.findMany({ where: { projectId: { in: ids }, deletedAt: null }, orderBy: { updatedAt: 'desc' }, take: 12 }),
    prisma.testCase.findMany({ where: { projectId: { in: ids }, deletedAt: null, lastStatus: 'FAIL' }, orderBy: { updatedAt: 'desc' }, take: 12, select: { id: true, name: true, targetType: true, targetId: true, projectId: true, updatedAt: true } }),
    prisma.reviewRequest.findMany({ where: { projectId: { in: ids }, status: 'PENDING', NOT: { submittedBy: me } }, orderBy: { createdAt: 'asc' }, take: 20 }),
    prisma.reviewRequest.findMany({ where: { projectId: { in: ids }, submittedBy: me }, orderBy: { createdAt: 'desc' }, take: 8 }),
    prisma.dataRequest.findMany({ where: { projectId: { in: ids }, deletedAt: null, status: 'OPEN' }, orderBy: { createdAt: 'asc' }, take: 20 }),
    prisma.execution.findMany({ where: { OR: [{ rule: { projectId: { in: ids } } }, { flow: { projectId: { in: ids } } }], status: 'FAILED' as any, createdAt: { gte: new Date(Date.now() - 7 * 864e5) } }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, error: true, createdAt: true, ruleId: true, flowId: true, rule: { select: { name: true, projectId: true } }, flow: { select: { name: true, projectId: true } } } }).catch(() => []),
  ]);
  const names = async (tt: string, xs: string[]) => tt === 'rule' ? prisma.rule.findMany({ where: { id: { in: xs } }, select: { id: true, name: true } }) : prisma.flow.findMany({ where: { id: { in: xs } }, select: { id: true, name: true } });
  const rn = new Map([...(await names('rule', failing.filter(f => f.targetType === 'rule').map(f => f.targetId!))), ...(await names('flow', failing.filter(f => f.targetType === 'decision_flow').map(f => f.targetId!)))].map(x => [x.id, x.name]));
  // per topic: lines, state and tests, so the home table reads without opening each one
  const tids = topics.map(t => t.id);
  const trules = await prisma.rule.findMany({ where: { topicId: { in: tids } }, select: { id: true, topicId: true, type: true, status: true, reviewState: true, definition: true } });
  const tflows = await prisma.flow.findMany({ where: { topicId: { in: tids }, status: { not: 'ARCHIVED' as any } }, select: { id: true, topicId: true, status: true, reviewState: true } });
  const rt = await testsFor('rule', trules.map(r => r.id)); const ft = await testsFor('decision_flow', tflows.map(f => f.id));
  const lineCount = (r: any) => { const d: any = r.definition || {}; return String(r.type).toUpperCase() === 'DECISION_TABLE' ? (d.rules || []).length : String(r.type).toUpperCase() === 'FORMULA' ? (d.lines || []).length : 0; };
  const sum = (t: any) => {
    const rs = trules.filter(r => r.topicId === t.id), fs = tflows.filter(f => f.topicId === t.id); const items: any[] = [...rs, ...fs];
    const ts = [...rs.map(r => rt.get(r.id)), ...fs.map(f => ft.get(f.id))].filter(Boolean) as any[];
    const state = !items.length ? 'empty' : items.some(i => i.reviewState === 'PENDING') ? 'review' : items.some(i => String(i.status).toUpperCase() !== 'PUBLISHED') ? 'draft' : 'live';
    return { decisions: items.length, lines: rs.reduce((a, r) => a + lineCount(r), 0), state,
      tests: { total: ts.reduce((a, b) => a + b.total, 0), pass: ts.reduce((a, b) => a + b.pass, 0), fail: ts.reduce((a, b) => a + (b.fail || 0), 0) } };
  };
  const ready = await prisma.dataRequest.findMany({ where: { projectId: { in: ids }, deletedAt: null, status: 'DONE', requestedBy: me, doneAt: { gte: new Date(Date.now() - 14 * 864e5) } }, orderBy: { doneAt: 'desc' }, take: 10 }).catch(() => []);
  const behind = await (await import('./library.js')).behind(ids).catch(() => []);
  return {
    libraryBehind: behind,
    topics: topics.map(t => ({ id: t.id, name: t.name, goal: t.goal, projectId: t.projectId, project: pname.get(t.projectId), updatedAt: t.updatedAt, shape: t.shape, ...sum(t) })),
    dataReady: (ready as any[]).map(d => ({ id: d.id, term: d.term, projectId: d.projectId, createdAt: d.createdAt, doneAt: d.doneAt, answer: d.answer })),
    failingTests: failing.map(f => ({ ...f, target: rn.get(f.targetId!) || '—', project: pname.get(f.projectId!) })),
    toApprove: reviews.map(r => ({ id: r.id, title: r.title, targetType: r.targetType, projectId: r.projectId, project: pname.get(r.projectId), submittedBy: r.submittedBy, createdAt: r.createdAt })),
    myRequests: mine.map(r => ({ id: r.id, title: r.title, status: r.status, projectId: r.projectId, createdAt: r.createdAt, decisionNote: r.decisionNote })),
    dataRequests: requests.map(d => ({ ...d, project: pname.get(d.projectId) })),
    apiErrors: (errors as any[]).map(e => ({ id: e.id, error: e.error, at: e.createdAt, name: e.rule?.name || e.flow?.name, projectId: e.rule?.projectId || e.flow?.projectId, kind: e.ruleId ? 'rule' : 'flow', targetId: e.ruleId || e.flowId })),
  };
}

export async function requestData(data: { projectId: string; term: string; path?: string; note?: string; sampleValue?: string; ruleId?: string; topicId?: string }, user: AuthUser) {
  const p = await assertProjectAccess(data.projectId, user, 'write');
  const term = String(data.term || '').trim(); if (!term) throw new ValidationError('Say which data you need');
  return prisma.dataRequest.create({ data: { projectId: p.id, term, path: data.path || null, note: data.note?.trim() || null, sampleValue: data.sampleValue ?? null, ruleId: data.ruleId || null, topicId: data.topicId || null, requestedBy: user.email || user.userId } });
}
export async function listRequests(projectIdOrSlug: string, user: AuthUser) {
  const p = await assertProjectAccess(projectIdOrSlug, user);
  return prisma.dataRequest.findMany({ where: { projectId: p.id, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 200 });
}
export async function closeRequest(id: string, data: { status?: 'DONE' | 'DECLINED'; answer?: string }, user: AuthUser) {
  const d = await prisma.dataRequest.findFirst({ where: { id, deletedAt: null } }); if (!d) throw new NotFoundError('Data request');
  await assertProjectAccess(d.projectId, user, 'write');
  return prisma.dataRequest.update({ where: { id }, data: { status: data.status === 'DECLINED' ? 'DECLINED' : 'DONE', answer: data.answer?.trim() || null, doneBy: user.email || user.userId, doneAt: new Date() } });
}
