// Reviews / approvals. Publishing is blocked until an approved review exists when the project
// requires review (project setting via env XRULES_REQUIRE_REVIEW=1 for now, per environment).
import { prisma } from '../config/database.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from './_access.js';
import type { AuthUser } from '../middleware/auth.js';

export const reviewRequired = () => process.env.XRULES_REQUIRE_REVIEW === '1';

export async function assertPublishable(projectId: string, targetType: string, targetId: string, _user: AuthUser) {
  if (!reviewRequired()) return;
  const ok = await prisma.reviewRequest.findFirst({ where: { projectId, targetType, targetId, status: 'APPROVED' }, orderBy: { decidedAt: 'desc' } });
  if (!ok) throw new ForbiddenError('ต้องผ่านการตรวจก่อน publish');
}

async function setState(targetType: string, targetId: string, state: string) {
  if (targetType === 'rule') await prisma.rule.update({ where: { id: targetId }, data: { reviewState: state } }).catch(() => {});
  if (targetType === 'decision_flow') await prisma.flow.update({ where: { id: targetId }, data: { reviewState: state } }).catch(() => {});
  if (targetType === 'api_spec') await prisma.apiSpec.update({ where: { id: targetId }, data: { reviewState: state } }).catch(() => {});
}

async function snapshotOf(targetType: string, targetId: string): Promise<{ projectId: string; title: string; snapshot: any }> {
  if (targetType === 'rule') { const r = await prisma.rule.findUnique({ where: { id: targetId } }); if (!r) throw new NotFoundError('Rule'); return { projectId: r.projectId, title: r.name, snapshot: { definition: r.definition, version: r.version } }; }
  if (targetType === 'decision_flow') { const f = await prisma.flow.findUnique({ where: { id: targetId } }); if (!f) throw new NotFoundError('Flow'); return { projectId: f.projectId, title: f.name, snapshot: { graph: f.graph, version: f.version } }; }
  if (targetType === 'api_spec') { const s = await prisma.apiSpec.findUnique({ where: { id: targetId }, include: { operations: { include: { flow: true } } } }); if (!s) throw new NotFoundError('API Spec');
    return { projectId: s.projectId, title: s.name, snapshot: { operations: s.operations.map(o => ({ method: o.method, path: o.path, graph: o.flow.graph })) } }; }
  throw new ValidationError(`unknown targetType ${targetType}`);
}

export async function submit(data: { targetType: string; targetId: string; note?: string; evidence?: any }, user: AuthUser) {
  const t = await snapshotOf(data.targetType, data.targetId);
  await assertProjectAccess(t.projectId, user, 'write');
  await prisma.reviewRequest.updateMany({ where: { targetType: data.targetType, targetId: data.targetId, status: 'PENDING' }, data: { status: 'WITHDRAWN', decidedAt: new Date() } });
  const r = await prisma.reviewRequest.create({ data: { projectId: t.projectId, targetType: data.targetType, targetId: data.targetId, title: t.title, submittedBy: user.email || user.userId, note: data.note, evidence: data.evidence, snapshot: t.snapshot } });
  await setState(data.targetType, data.targetId, 'PENDING');
  await audit(t.projectId, user, 'review.submit', data.targetType, data.targetId);
  return r;
}

export async function decide(id: string, decision: 'APPROVED' | 'REJECTED', note: string | undefined, user: AuthUser) {
  const r = await prisma.reviewRequest.findUnique({ where: { id } });
  if (!r) throw new NotFoundError('Review');
  await assertProjectAccess(r.projectId, user, 'admin');
  if (r.status !== 'PENDING') throw new ValidationError(`review is ${r.status.toLowerCase()}`);
  if (r.submittedBy === (user.email || user.userId)) throw new ForbiddenError('อนุมัติงานที่ตัวเองส่งไม่ได้');
  const out = await prisma.reviewRequest.update({ where: { id }, data: { status: decision, reviewedBy: user.email || user.userId, decisionNote: note, decidedAt: new Date() } });
  await setState(r.targetType, r.targetId, decision);
  await audit(r.projectId, user, `review.${decision.toLowerCase()}`, r.targetType, r.targetId);
  return out;
}

export async function list(projectIdOrSlug: string, user: AuthUser, status?: string) {
  const p = await assertProjectAccess(projectIdOrSlug, user);
  return prisma.reviewRequest.findMany({ where: { projectId: p.id, ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
}

export async function audit(projectId: string, user: AuthUser, action: string, entityType: string, entityId: string, meta?: any) {
  const p = await prisma.project.findUnique({ where: { id: projectId } });
  if (!p) return;
  await prisma.auditLog.create({ data: { workspaceId: p.workspaceId, userId: user.userId === '__system__' ? null : user.userId, action, entityType, entityId, metadata: meta ?? {} } as any }).catch(() => {});
}
