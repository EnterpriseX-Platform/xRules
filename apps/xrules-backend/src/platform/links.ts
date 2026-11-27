// What a decision uses, who uses it and what checks it: the three questions every screen answers the same way.
import { prisma } from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';
import { assertProjectAccess } from '../services/_access.js';
import type { AuthUser } from '../middleware/auth.js';
import { flowUses, usedBy } from './scope.js';

const KIND: Record<string, string> = { DECISION_TABLE: 'qualify', DECISION_TREE: 'qualify', FORMULA: 'amount', SCORECARD: 'amount', LOOKUP: 'qualify', SCRIPT: 'qualify', MODEL_CALL: 'model', AI_AGENT: 'model' };

/** Field paths a rule or flow reads, found in its definition. */
function fieldsOf(def: any, graph: any): string[] {
  const out = new Set<string>();
  const words = (s: any) => (String(s ?? '').match(/[A-Za-z_][\w]*/g) || []).forEach(w => out.add(w));
  (def?.inputs || []).forEach((c: any) => c?.name && out.add(String(c.name).replace(/^(any|all):/, '')));
  (def?.lines || []).forEach((l: any) => words(l?.expr));
  for (const n of graph?.nodes || []) {
    const d = n.data || {};
    words(d.condition); words(d.expression);
    (d.weights || []).forEach((w: any) => w?.term && out.add(String(w.term)));
    if (typeof d.budget === 'string') out.add(d.budget);
    if (d.cost) out.add(String(d.cost));
  }
  return [...out];
}

export async function links(kind: 'rule' | 'flow', id: string, user: AuthUser) {
  const row: any = kind === 'rule' ? await prisma.rule.findUnique({ where: { id } }) : await prisma.flow.findUnique({ where: { id } });
  if (!row) throw new NotFoundError(kind === 'rule' ? 'Rule' : 'Flow');
  await assertProjectAccess(row.projectId, user);
  const terms = await prisma.vocabularyTerm.findMany({ where: { projectId: row.projectId }, select: { term: true, path: true, type: true, description: true } });
  const byPath = new Map(terms.map(t => [t.path, t]));
  const produced = new Set<string>((row.definition?.lines || []).map((l: any) => l?.name).concat((row.definition?.outputs || []).map((o: any) => o?.name)).filter(Boolean));
  const uses: any[] = [];
  if (kind === 'flow') {
    const u = await flowUses(id);
    for (const it of u.items) uses.push({ kind: it.kind === 'rule' ? 'decision' : 'flow', id: it.id, name: it.name, href: it.kind === 'rule' ? `/p/${row.projectId}/rules/${it.id}` : `/p/${row.projectId}/flows/${it.id}` });
    const items = (row.graph?.nodes || []).find((n: any) => n.type === 'items');
    if (items?.data?.dataset) uses.push({ kind: 'data', id: items.data.dataset, name: items.data.dataset, href: '/data-sets' });
  }
  for (const f of fieldsOf(row.definition, kind === 'flow' ? row.graph : null)) {
    const t = byPath.get(f); if (!t || produced.has(f)) continue;
    uses.push({ kind: 'word', id: t.path, name: t.term, note: t.description?.startsWith('Requested') ? 'requested' : t.type, href: `/p/${row.projectId}/vocabulary` });
  }
  const ub = await usedBy(kind, id);
  const usedByList = [
    ...ub.flows.map((f: any) => ({ kind: 'flow', id: f.id, name: f.name, href: `/p/${row.projectId}/flows/${f.id}` })),
    ...ub.operations.map((o: any) => ({ kind: 'api', id: o.id, name: `${o.method} ${o.path}`, note: o.spec?.name, href: `/apis/${o.spec?.id}` })),
  ];
  const cases = await prisma.testCase.findMany({ where: { deletedAt: null, targetType: kind === 'rule' ? 'rule' : 'decision_flow', targetId: id }, select: { lastStatus: true } });
  return {
    kind: kind === 'rule' ? (KIND[String(row.type).toUpperCase()] || 'qualify') : 'strategy',
    uses, usedBy: usedByList,
    checks: { total: cases.length, pass: cases.filter(c => c.lastStatus === 'PASS').length, fail: cases.filter(c => c.lastStatus && c.lastStatus !== 'PASS').length },
  };
}

/** For each word of a project: the decisions that read it (Words screen "Used in"). */
export async function termUsage(projectIdOrSlug: string, user: AuthUser) {
  const p = await assertProjectAccess(projectIdOrSlug, user);
  const [rules, flows] = await Promise.all([
    prisma.rule.findMany({ where: { projectId: p.id }, select: { id: true, name: true, topicId: true, definition: true } }),
    prisma.flow.findMany({ where: { projectId: p.id, status: { not: 'ARCHIVED' as any } }, select: { id: true, name: true, topicId: true, graph: true } }),
  ]);
  const out: Record<string, { kind: string; id: string; name: string; topicId: string | null; href: string }[]> = {};
  const add = (f: string, x: any) => { (out[f] ||= []).push(x); };
  for (const r of rules as any[]) for (const f of fieldsOf(r.definition, null).concat((r.definition?.outputs || []).map((o: any) => o?.name).filter(Boolean))) add(f, { kind: 'decision', id: r.id, name: r.name, topicId: r.topicId, href: `/p/${p.id}/rules/${r.id}` });
  for (const fl of flows as any[]) for (const f of fieldsOf(null, fl.graph)) add(f, { kind: 'flow', id: fl.id, name: fl.name, topicId: fl.topicId, href: `/p/${p.id}/flows/${fl.id}` });
  for (const k of Object.keys(out)) out[k] = out[k].filter((x, i, a) => a.findIndex(y => y.id === x.id) === i);
  return out;
}
