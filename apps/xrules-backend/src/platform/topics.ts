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
  const m = new Map<string, { total: number; pass: number; fail?: number }>();
  for (const c of cases) { const k = c.targetId!; const v = m.get(k) || { total: 0, pass: 0, fail: 0 }; v.total++; if (c.lastStatus === 'PASS') v.pass++; else if (c.lastStatus) v.fail = (v.fail || 0) + 1; m.set(k, v); }
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
  return { id: t.id, projectId: t.projectId, name: t.name, description: t.description, goal: t.goal, createdAt: t.createdAt, updatedAt: t.updatedAt, lastSimulation: t.lastSimulation, decisions };
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

// ---- Simulation in business terms: run the live version and the draft over the same data, then summarise
async function runRuleDef(rule: any, definition: any, input: any) {
  const { tryLocalExecutor, applyElseRow, shapeByHitPolicy, transformDefinitionForEngine, executeDmnLocally } = await import('../services/execute.service.js');
  const r = { ...rule, definition };
  const local = r.type === 'DECISION_TABLE' && String(definition?.hitPolicy).toUpperCase() === 'EVALUATE_ALL' ? executeDmnLocally(r, input) : await tryLocalExecutor(r, input, {});
  if (local != null) return local;
  const axios = (await import('axios')).default; const { env } = await import('../config/env.js');
  const resp = await axios.post(`${env.engineHubUrl}/api/v1/execute`, { rule: { type: rule.type, engine: rule.engine || 'rules', definition: transformDefinitionForEngine(r) }, input, context: { rule_id: rule.id } }, { timeout: 30000 });
  let out = resp.data.output ?? resp.data;
  try { out = shapeByHitPolicy(r, applyElseRow(r, out)); } catch { /* keep raw */ }
  return out;
}
const flat = (o: any, p = ''): Record<string, any> => (o && typeof o === 'object' && !Array.isArray(o) ? Object.entries(o).reduce((a, [k, v]) => ({ ...a, ...flat(v, p ? `${p}.${k}` : k) }), {}) : { [p || 'result']: o });
function summarise(outs: any[]) {
  const fields: Record<string, { kind: 'number' | 'value'; sum?: number; count: number; values?: Record<string, number> }> = {};
  for (const o of outs) for (const [k, v] of Object.entries(flat(o))) {
    if (Array.isArray(v) || k === 'error') continue;
    const f = fields[k] ||= typeof v === 'number' ? { kind: 'number', sum: 0, count: 0 } : { kind: 'value', count: 0, values: {} };
    f.count++;
    if (f.kind === 'number') f.sum! += Number(v) || 0; else { const s = String(v); f.values![s] = (f.values![s] || 0) + 1; }
  }
  return fields;
}
const nameOf = (it: any) => it?.name ?? it?.title ?? it?.project ?? it?.code ?? it?.id;

export async function simulate(id: string, data: { decisionId: string; dataset?: string; input?: any; limit?: number; attach?: boolean }, user: AuthUser) {
  const t = await prisma.topic.findFirst({ where: { id, deletedAt: null } }); if (!t) throw new NotFoundError('Topic');
  await assertProjectAccess(t.projectId, user, 'write');
  const rule = await prisma.rule.findFirst({ where: { id: data.decisionId, topicId: id } });
  const flow = rule ? null : await prisma.flow.findFirst({ where: { id: data.decisionId, topicId: id } });
  if (!rule && !flow) throw new NotFoundError('Decision');
  const started = Date.now(); let result: any;

  if (flow) {
    // a strategy runs once over the whole list; compare who is chosen
    const { runArtifact } = await import('./runner.js');
    const input = data.input || {};
    const draft = await runArtifact(t.projectId, flow.id, input, { draft: true });
    const hasLive = !!(await prisma.flowVersion.findFirst({ where: { flowId: flow.id, status: 'PUBLISHED' } }));
    const live = hasLive ? await runArtifact(t.projectId, flow.id, input, {}) : null;
    const side = (r: any) => r ? { error: r.error, picked: (r.output?.picked || []).length, dropped: (r.output?.dropped || []).length, allocation: r.output?.allocation || null, chosen: (r.output?.picked || []).map(nameOf) } : null;
    const d = side(draft), l = side(live);
    const now = new Set(d?.chosen || []), before = new Set(l?.chosen || []);
    result = { kind: 'strategy', live: l, draft: d,
      newlyChosen: l ? [...now].filter(x => !before.has(x)) : [], noLongerChosen: l ? [...before].filter(x => !now.has(x)) : [],
      whyNot: (draft.output?.dropped || []).slice(0, 200).map((x: any) => ({ name: nameOf(x), step: x.droppedAt, reason: x.reason })) };
  } else {
    // a rule runs per row of the data set
    if (!data.dataset) throw new ValidationError('Choose a data set to simulate on');
    const ds = await (await import('../data/datasets-runtime.js')).findDataset(t.projectId, data.dataset);
    if (!ds?.activeSnapshotId) throw new ValidationError(`Data set '${data.dataset}' has no data yet`);
    const rows = (await prisma.datasetRow.findMany({ where: { snapshotId: ds.activeSnapshotId }, take: Math.min(Number(data.limit) || 2000, 5000), orderBy: { idx: 'asc' }, select: { data: true } })).map(r => r.data as any);
    const pub = await prisma.ruleVersion.findFirst({ where: { ruleId: rule!.id, status: 'PUBLISHED' as any }, orderBy: { version: 'desc' } });
    const dOut: any[] = [], lOut: any[] = []; const changed: any[] = []; let errors = 0;
    for (const row of rows) {
      const a = await runRuleDef(rule, rule!.definition, row).catch(e => { errors++; return { error: e.message }; });
      dOut.push(a);
      if (pub) {
        const b = await runRuleDef(rule, pub.definition, row).catch(e => ({ error: e.message }));
        lOut.push(b);
        if (JSON.stringify(a) !== JSON.stringify(b) && changed.length < 50) changed.push({ name: nameOf(row), input: row, live: b, draft: a });
      }
    }
    result = { kind: 'rule', rows: rows.length, errors, draft: summarise(dOut), live: pub ? summarise(lOut) : null, liveVersion: pub?.version ?? null,
      changedCount: pub ? dOut.filter((o, i) => JSON.stringify(o) !== JSON.stringify(lOut[i])).length : null, changed };
  }
  result = { ...result, decisionId: data.decisionId, dataset: data.dataset || null, ms: Date.now() - started, at: new Date().toISOString(), by: user.email || user.userId };
  await prisma.topic.update({ where: { id }, data: { lastSimulation: result } }).catch(() => {});
  if (data.attach) {
    const rv = await prisma.reviewRequest.findFirst({ where: { targetId: data.decisionId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } });
    if (rv) await prisma.reviewRequest.update({ where: { id: rv.id }, data: { evidence: { ...((rv.evidence as any) || {}), simulation: result } } });
    result.attachedTo = rv?.id || null;
  }
  return result;
}
