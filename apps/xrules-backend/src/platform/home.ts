// Home by role: business users see their topics and failing tests, approvers the changes waiting for them,
// developers the data requests and API errors. One call, filtered to what the caller may see.
import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from '../services/_access.js';
import type { AuthUser } from '../middleware/auth.js';

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
  return {
    topics: topics.map(t => ({ id: t.id, name: t.name, goal: t.goal, projectId: t.projectId, project: pname.get(t.projectId), updatedAt: t.updatedAt })),
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
