// Run a whole topic for one applicant: every step in order, each decision and calculation reading what the
// earlier ones worked out. Reason codes raised in any step are collected; the final reason is the one with the
// best priority in the project's catalogue. Used by topic test cases and by the test strip beside an editor.
import { prisma } from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';

const SYSTEM = { userId: '__system__', email: 'test@xrules', tenantId: '*', roles: ['OWNER'] } as any;
const REASON_KEYS = new Set(['reasons', 'reason', 'reasonText', 'outcome']);

export async function runTopic(topicId: string, input: any) {
  const t = await prisma.topic.findFirst({ where: { id: topicId, deletedAt: null } });
  if (!t) throw new NotFoundError('Topic');
  const rules = await prisma.rule.findMany({ where: { topicId }, orderBy: { createdAt: 'asc' } });
  const flows = await prisma.flow.findMany({ where: { topicId, status: { not: 'ARCHIVED' as any } }, orderBy: { createdAt: 'asc' } });
  const stages: any[] = Array.isArray(t.stages) ? (t.stages as any[]) : [];
  const order: string[] = [];
  for (const s of stages) for (const i of s?.items || []) if (!order.includes(String(i))) order.push(String(i));
  for (const r of rules) if (!order.includes(r.id)) order.push(r.id);
  for (const f of flows) if (!order.includes(f.id)) order.push(f.id);

  const { executeRule, reasonCatalogue } = await import('../services/execute.service.js');
  const { evaluateTable, rowMatches, usesGroupsOrReasons } = await import('../services/table-eval.js');
  const catalogue = await reasonCatalogue(t.projectId);
  const ctx: any = JSON.parse(JSON.stringify(input || {}));
  const out: Record<string, any> = {}; const codes: string[] = []; const trace: any[] = [];
  const take = (o: any) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(take); return; }
    for (const [k, v] of Object.entries(o)) {
      if (k === 'reasons' && Array.isArray(v)) { v.forEach(c => { if (!codes.includes(String(c))) codes.push(String(c)); }); continue; }
      if (REASON_KEYS.has(k) || k === 'lines' || k === '_match') { if (k === 'lines') take(v); continue; }
      ctx[k] = v; out[k] = v;
    }
  };
  for (const id of order) {
    const r = rules.find(x => x.id === id);
    const f = r ? null : flows.find(x => x.id === id);
    if (!r && !f) continue;
    try {
      let o: any; let lines: number[] | undefined;
      if (r) {
        const def: any = r.definition || {};
        if (r.type === 'DECISION_TABLE') lines = (def.rules || []).map((row: any, i: number) => (rowMatches(def, row, ctx) ? i + 1 : 0)).filter(Boolean);
        o = r.type === 'DECISION_TABLE' && usesGroupsOrReasons(def) ? evaluateTable(def, ctx, catalogue) : ((await executeRule(r.id, ctx, {}, SYSTEM)) as any).output;
      } else {
        const { runArtifact } = await import('./runner.js');
        const res = await runArtifact(t.projectId, f!.id, ctx, { draft: true });
        if (res.error) throw new Error(res.error);
        o = res.output;
      }
      take(o);
      trace.push({ id, name: r?.name || f?.name, lines, output: o });
    } catch (e: any) {
      trace.push({ id, name: r?.name || f?.name, error: String(e?.response?.data?.error?.message || e?.message || e) });
    }
  }
  const known = codes.map(c => catalogue.find((x: any) => x.code === c) || { code: c, text: c, outcome: 'Decline', priority: Number.MAX_SAFE_INTEGER });
  const top = [...known].sort((a: any, b: any) => a.priority - b.priority)[0] as any;
  return { output: { ...out, reasons: codes, reason: top?.code ?? null, reasonText: top?.text ?? null, outcome: top?.outcome ?? 'Approve' }, trace };
}

/** Bring in many cases at once: each row has input words and expected results (by data path). */
export async function importCases(data: { projectId?: string; topicId?: string; rows: { name?: string; input: any; expected: Record<string, any> }[]; replace?: boolean }, user: any) {
  const { assertProjectAccess } = await import('../services/_access.js');
  let projectId = data.projectId; let targetType = 'project'; let targetId: string | undefined = undefined;
  if (data.topicId) { const t = await prisma.topic.findFirst({ where: { id: data.topicId, deletedAt: null } }); if (!t) throw new NotFoundError('Topic'); projectId = t.projectId; targetType = 'topic'; targetId = t.id; }
  const p = await assertProjectAccess(String(projectId), user, 'write');
  targetId ||= p.id;
  if (data.replace) await prisma.testCase.updateMany({ where: { deletedAt: null, targetType, targetId }, data: { deletedAt: new Date(), deletedBy: user.userId } });
  const existing = await prisma.testCase.findMany({ where: { deletedAt: null, targetType, targetId }, select: { id: true, name: true } });
  let created = 0, updated = 0;
  for (const [i, row] of (data.rows || []).entries()) {
    const name = String(row.name || `Case ${i + 1}`).trim().slice(0, 200);
    const expectations = Object.entries(row.expected || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined).map(([path, value]) => ({ kind: 'equals', path, value }));
    const hit = existing.find(e => e.name === name);
    if (hit) { await prisma.testCase.update({ where: { id: hit.id }, data: { input: row.input ?? {}, expectations: expectations as any, lastStatus: 'PENDING' } }); updated++; }
    else { await prisma.testCase.create({ data: { name, projectId: p.id, targetType, targetId, input: row.input ?? {}, expectations: expectations as any } }); created++; }
  }
  return { created, updated };
}

/** Cases brought in before the project had a topic move to the first topic made. */
export async function adoptProjectCases(projectId: string, topicId: string) {
  await prisma.testCase.updateMany({ where: { deletedAt: null, targetType: 'project', targetId: projectId }, data: { targetType: 'topic', targetId: topicId } });
}
