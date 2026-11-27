// Reviews / approvals. Publishing is blocked until an approved review exists when the project
// requires review (project setting via env XRULES_REQUIRE_REVIEW=1 for now, per environment).
import { prisma } from '../config/database.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from './_access.js';
import type { AuthUser } from '../middleware/auth.js';

// Approval before going live is on unless the organization turns it off (Organization settings › General).
export async function reviewRequired(projectId: string) {
  if (process.env.XRULES_REQUIRE_REVIEW === '0') return false;
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { workspace: { select: { settings: true } } } });
  return (p?.workspace?.settings as any)?.requireApproval !== false;
}

// what an approval covers: the content only (a review-state flag changing is not an edit)
function content(snap: any) { return JSON.stringify(snap?.definition ?? snap?.graph ?? snap?.operations ?? null); }

export async function assertPublishable(projectId: string, targetType: string, targetId: string, _user: AuthUser) {
  const { assertTestsPass } = await import('../platform/testing.js');
  await assertTestsPass(targetType, targetId);
  if (!(await reviewRequired(projectId))) return;
  // an approval counts only for what was approved: any edit after it needs a new one
  const ok = await prisma.reviewRequest.findFirst({ where: { projectId, targetType, targetId, status: 'APPROVED' }, orderBy: { decidedAt: 'desc' } });
  const now = await snapshotOf(targetType, targetId).catch(() => null);
  if (!ok || !now || content(ok.snapshot) !== content(now.snapshot)) throw new ForbiddenError('Request approval first: someone else must approve this change before it goes live');
}

async function setState(targetType: string, targetId: string, state: string) {
  if (targetType === 'rule') await prisma.rule.update({ where: { id: targetId }, data: { reviewState: state } }).catch(() => {});
  if (targetType === 'decision_flow') await prisma.flow.update({ where: { id: targetId }, data: { reviewState: state } }).catch(() => {});
  if (targetType === 'api_spec') await prisma.apiSpec.update({ where: { id: targetId }, data: { reviewState: state } }).catch(() => {});
}

async function snapshotOf(targetType: string, targetId: string): Promise<{ projectId: string; title: string; snapshot: any }> {
  if (targetType === 'rule') { const r = await prisma.rule.findUnique({ where: { id: targetId } }); if (!r) throw new NotFoundError('Rule');
    const live = await prisma.ruleVersion.findFirst({ where: { ruleId: r.id, status: 'PUBLISHED' } as any, orderBy: { createdAt: 'desc' } }).catch(() => null);
    return { projectId: r.projectId, title: r.name, snapshot: { type: r.type, definition: r.definition, version: r.version, live: (live as any)?.definition ?? null, liveVersion: (live as any)?.version ?? null } }; }
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
  // approvers: tenant owners/admins, or members marked "can approve" who can see the project
  await assertProjectAccess(r.projectId, user, 'read');
  const p = await prisma.project.findUnique({ where: { id: r.projectId }, select: { workspaceId: true } });
  const m = await prisma.workspaceMember.findFirst({ where: { workspaceId: p!.workspaceId, userId: user.userId } });
  if (!m || !(m.role === 'OWNER' || m.role === 'ADMIN' || m.canApprove)) throw new ForbiddenError('You are not an approver in this tenant');
  if (r.status !== 'PENDING') throw new ValidationError(`review is ${r.status.toLowerCase()}`);
  if (r.submittedBy === (user.email || user.userId)) throw new ForbiddenError('You cannot approve your own submission');
  const out = await prisma.reviewRequest.update({ where: { id }, data: { status: decision, reviewedBy: user.email || user.userId, decisionNote: note, decidedAt: new Date() } });
  await setState(r.targetType, r.targetId, decision);
  await audit(r.projectId, user, `review.${decision.toLowerCase()}`, r.targetType, r.targetId);
  // approving puts the change live; the approver is the one who publishes
  if (decision === 'APPROVED') {
    try {
      if (r.targetType === 'rule') await (await import('./rules.service.js')).publishRule(r.targetId, user);
      if (r.targetType === 'decision_flow') await (await import('./flows.service.js')).publishFlow(r.targetId, `Approved by ${user.email || user.userId}`, user);
      if (r.targetType === 'api_spec') await (await import('./apispecs.service.js')).publish(r.targetId, user, `Approved by ${user.email || user.userId}`);
      if (r.targetType === 'rollback') return { ...out, rollback: await (await import('../platform/ops.js')).performRollback(r.targetId, user) };
      if (r.targetType === 'param_change') return { ...out, applied: await (await import('../platform/ops.js')).applyDueChanges(r.id) };
    } catch (e: any) { return { ...out, publishError: e?.message || String(e) }; }
  }
  return out;
}

export async function list(projectIdOrSlug: string, user: AuthUser, status?: string) {
  const { projectScope } = await import('../platform/scope.js');
  const ids = await projectScope(projectIdOrSlug, user);
  return prisma.reviewRequest.findMany({ where: { projectId: { in: ids }, ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
}

export async function audit(projectId: string, user: AuthUser, action: string, entityType: string, entityId: string, meta?: any) {
  const p = await prisma.project.findUnique({ where: { id: projectId } });
  if (!p) return;
  // audit_logs columns are resource / resourceId / details, and a user is required
  if (!user.userId || user.userId === '__system__') return;
  await prisma.auditLog.create({ data: { workspaceId: p.workspaceId, userId: user.userId, action, resource: entityType, resourceId: entityId, details: meta ?? {} } }).catch(() => {});
}
