// Run a whole topic for one applicant: every step in order, each decision and calculation reading what the
// earlier ones worked out. Reason codes raised in any step are collected; the final reason is the one with the
// best priority in the project's catalogue. Used by topic test cases and by the test strip beside an editor.
import { prisma } from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';

const SYSTEM = { userId: '__system__', email: 'test@xrules', tenantId: '*', roles: ['OWNER'] } as any;
const REASON_KEYS = new Set(['reasons', 'reason', 'reasonText', 'outcome', 'decisionResult', 'clear', 'setDecision', '_errors', '_trace', '_unknown']);
/** Words every step can read: what earlier steps raised. */
export const RUN_WORDS = ['reasons so far', 'outcomes so far', 'top reason so far', 'top outcome so far'];

/** What a topic answers when no reason fires, and its decision date. */
export const topicSettings = (t: any) => { const s = t?.settings && typeof t.settings === 'object' ? t.settings : {}; return { decisionDate: s.decisionDate || null, outputs: { result: s.outputs?.result || null, decision: s.outputs?.decision || null, reasons: s.outputs?.reasons || null } as Record<'result' | 'decision' | 'reasons', string | null>, noReason: { outcome: s.noReason?.outcome || 'Approve', result: s.noReason?.result || s.noReason?.outcome || 'Approve' } }; };

/** Take reasons out of the running list: codes, "outcome:Reject" (every code of that outcome) or "all". */
export function clearReasons(codes: string[], specs: string[], info: (c: string) => { outcome?: any }): string[] {
  const gone = codes.filter(c => specs.some(sp => { const t = String(sp).trim(); if (/^all$/i.test(t)) return true; const m = t.match(/^outcome\s*[:=]?\s*(.+)$/i); return m ? String(info(c).outcome).toLowerCase() === m[1].trim().toLowerCase() : t === c; }));
  gone.forEach(c => codes.splice(codes.indexOf(c), 1)); return gone;
}

export async function runTopic(topicId: string, input: any, opts: { overrides?: Record<string, any> } = {}) {
  const t = await prisma.topic.findFirst({ where: { id: topicId, deletedAt: null } });
  if (!t) throw new NotFoundError('Topic');
  const { withDecisionDate, decisionDateIn } = await import('../services/table-eval.js');
  const set = topicSettings(t);
  // a case's own decision date wins over the topic's
  return withDecisionDate(decisionDateIn(input) || set.decisionDate, () => runSteps(t, input, set, opts.overrides || {}));
}

async function runSteps(t: any, input: any, set: ReturnType<typeof topicSettings>, overrides: Record<string, any>) {
  const topicId = t.id;
  const { withSettings } = await import('./product-settings.js');
  const product = typeof input?.product === 'string' && input.product.trim() ? input.product.trim() : t.product || null;
  // a decision replaced for this run (approval ripple, a newer library version) and settings filled for the product
  const stages: any[] = Array.isArray(t.stages) ? (t.stages as any[]) : [];
  // an archived decision never runs; once the topic has steps, a decision taken out of every step does not run either
  const staged = new Set(stages.flatMap((s: any) => (s?.items || []).map(String)));
  const rules = await Promise.all((await prisma.rule.findMany({ where: { topicId, status: { not: 'ARCHIVED' as any } }, orderBy: { createdAt: 'asc' } }))
    .filter(r => t.shape !== 'steps' || !stages.length || staged.has(r.id))
    .map(r => { const x = overrides[r.id] ? { ...r, definition: overrides[r.id], libraryRef: null } : r; return withSettings(x, input, product).catch((e: any) => ({ ...x, settingError: String(e?.message || e) })); }));
  const flows = await prisma.flow.findMany({ where: { topicId, status: { not: 'ARCHIVED' as any } }, orderBy: { createdAt: 'asc' } });
  const order: string[] = [];
  // within a step, a rule that works out a word runs before the rules that use it; else the step's own order
  for (const s of stages) for (const i of byDependency((s?.items || []).map(String), rules)) if (!order.includes(i)) order.push(i);
  for (const r of rules) if (!order.includes(r.id)) order.push(r.id);
  for (const f of flows) if (!order.includes(f.id)) order.push(f.id);

  const { executeRule, reasonCatalogue } = await import('../services/execute.service.js');
  const { evaluateTable, rowMatches, usesGroupsOrReasons } = await import('../services/table-eval.js');
  const catalogue = Object.assign(await reasonCatalogue(t.projectId), { noReason: set.noReason });
  const ctx: any = JSON.parse(JSON.stringify(input || {}));
  const out: Record<string, any> = {}; const codes: string[] = []; const trace: any[] = [];
  const info = (c: string) => catalogue.find((x: any) => x.code === c) || { code: c, text: c, outcome: 'Decline', result: null, priority: Number.MAX_SAFE_INTEGER };
  const topOf = (cs: string[]) => [...cs.map(info)].sort((a: any, b: any) => a.priority - b.priority)[0] as any;
  // what earlier steps raised, readable by the later steps as words
  const soFar = () => { const top = topOf(codes); ctx['reasons so far'] = [...codes]; ctx['outcomes so far'] = Array.from(new Set(codes.map(c => String(info(c).outcome)))); ctx['top reason so far'] = top?.code ?? null; ctx['top outcome so far'] = top?.outcome ?? null; };
  soFar();
  let decision: { value: string; step: string } | null = null;
  // a step's lines clear what earlier steps raised first ("M005", "outcome:Reject", "all"), then add their own
  const clearing = (specs: string[]) => clearReasons(codes, specs, info);
  let step: { added: string[]; cleared: string[]; errors?: any } = { added: [], cleared: [] };
  const take = (o: any) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(take); return; }
    if (Array.isArray(o.clear)) step.cleared.push(...clearing(o.clear.map(String)));
    if (o._errors && typeof o._errors === 'object') step.errors = { ...(step.errors || {}), ...o._errors };
    for (const [k, v] of Object.entries(o)) {
      if (k === 'reasons' && Array.isArray(v)) { v.forEach(c => { if (!codes.includes(String(c))) { codes.push(String(c)); step.added.push(String(c)); } }); continue; }
      if (k === 'setDecision' && typeof v === 'string' && v.trim()) { decision = { value: v.trim(), step: '' }; continue; }
      if (REASON_KEYS.has(k) || k === 'lines' || k === '_match') { if (k === 'lines') take(v); continue; }
      ctx[k] = v; out[k] = v;
    }
  };
  for (const id of order) {
    const r = rules.find(x => x.id === id);
    const f = r ? null : flows.find(x => x.id === id);
    if (!r && !f) continue;
    step = { added: [], cleared: [] }; const before = decision;
    try {
      let o: any; let lines: number[] | undefined;
      if ((r as any)?.settingError) throw new Error((r as any).settingError);
      if (r) {
        const def: any = r.definition || {};
        if (r.type === 'DECISION_TABLE') lines = (def.rules || []).map((row: any, i: number) => (rowMatches(def, row, ctx) ? i + 1 : 0)).filter(Boolean);
        o = r.type === 'DECISION_TABLE' && usesGroupsOrReasons(def) ? evaluateTable(def, ctx, catalogue) : ((await executeRule(r.id, ctx, { __definition: def }, SYSTEM)) as any).output;
      } else {
        const { runArtifact } = await import('./runner.js');
        const res = await runArtifact(t.projectId, f!.id, ctx, { draft: true });
        if (res.error) throw new Error(res.error);
        o = res.output;
      }
      take(o);
      if (decision && decision !== before) (decision as any).step = r?.name || f?.name || '';
      soFar();
      // where each line came from: the library (and its version) or this product
      const origins: string[] | undefined = (r as any)?.libraryRef?.origins;
      const from = origins && lines ? lines.map(n => origins[n - 1] || '') : origins && r?.type === 'FORMULA' ? origins : undefined;
      trace.push({ id, name: r?.name || f?.name, lines, output: o, ...(from && { from }), ...((r as any)?.libraryRef?.itemId && { origin: (r as any).libraryRef.mode }),
        ...(step.added.length && { added: step.added }), ...(step.cleared.length && { cleared: step.cleared }), ...(decision && decision !== before ? { decision: (decision as any).value } : {}),
        ...(step.errors && { lineErrors: step.errors }) });
    } catch (e: any) {
      soFar();
      trace.push({ id, name: r?.name || f?.name, error: String(e?.response?.data?.error?.message || e?.message || e) });
    }
  }
  const top = topOf(codes);
  const d = decision as { value: string; step: string } | null;
  const final: any = { ...out, reasons: codes, reason: top?.code ?? null, reasonText: top?.text ?? null, outcome: d ? d.value : top ? top.outcome : set.noReason.outcome,
    decisionResult: d ? d.value : top ? top.result || top.outcome : set.noReason.result };
  // the topic names the words that receive the top reason's result, the final decision and the reasons list
  if (set.outputs.result) final[set.outputs.result] = final.decisionResult;
  if (set.outputs.decision) final[set.outputs.decision] = final.outcome;
  if (set.outputs.reasons) final[set.outputs.reasons] = codes;
  return { output: final, trace };
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

/** Words a rule works out, and the text it reads them from. */
function makes(r: any): string[] {
  const d: any = r?.definition || {};
  if (Array.isArray(d.lines)) return d.lines.map((l: any) => String(l?.name || '')).filter(Boolean);
  return (d.outputs || []).map((o: any) => String(o?.name || '')).filter(Boolean);
}
function reads(r: any): string { const d: any = r?.definition || {}; return JSON.stringify({ i: d.inputs, r: d.rules, l: (d.lines || []).map((l: any) => l?.expr) }); }
export function byDependency(ids: string[], rules: any[]): string[] {
  const of = new Map(ids.map(id => [id, rules.find(r => r.id === id)]));
  const needs = new Map<string, Set<string>>();
  for (const a of ids) {
    const ra = of.get(a); const txt = ra ? reads(ra) : '';
    needs.set(a, new Set(ids.filter(b => b !== a && of.get(b) && makes(of.get(b)).some(w => new RegExp(`(?<![\\w.])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`).test(txt)))));
  }
  const out: string[] = []; const seen = new Set<string>(); const busy = new Set<string>();
  const visit = (id: string) => { if (seen.has(id) || busy.has(id)) return; busy.add(id); for (const n of ids) if (needs.get(id)!.has(n)) visit(n); busy.delete(id); seen.add(id); out.push(id); };
  ids.forEach(visit);
  return out;
}

/** Remove (stamp) or bring back several test cases at once. */
export async function stampCases(ids: any, user: any, remove: boolean) {
  const { assertProjectAccess } = await import('../services/_access.js');
  const list = (Array.isArray(ids) ? ids : []).map(String).slice(0, 5000);
  const cases = await prisma.testCase.findMany({ where: { id: { in: list } }, select: { id: true, projectId: true } });
  for (const pid of Array.from(new Set(cases.map(c => c.projectId)))) await assertProjectAccess(String(pid), user, 'write');
  const r = await prisma.testCase.updateMany({ where: { id: { in: cases.map(c => c.id) } }, data: remove ? { deletedAt: new Date(), deletedBy: user.userId } : { deletedAt: null, deletedBy: null } });
  return { count: r.count };
}
