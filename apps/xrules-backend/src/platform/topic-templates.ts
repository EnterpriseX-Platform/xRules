// Start a topic from a template (or from a typed description, matched to the closest template):
// terms, decisions, test cases and sample data, all as drafts the business user then changes.
import { prisma } from '../config/database.js';
import { ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from '../services/_access.js';
import type { AuthUser } from '../middleware/auth.js';

type T = { term: string; path: string; type: string; unit?: string; values?: string[] };
type Tpl = {
  key: string; name: string; goal: string; words: RegExp;
  terms: T[];
  rules: { name: string; type: 'DECISION_TABLE' | 'FORMULA'; definition: any; tests: { name: string; input: any; expect: Record<string, any> }[] }[];
  strategy?: { name: string; steps: [string, any][]; tests: { name: string; input: any; expect: Record<string, any> }[] };
  sample?: { slug: string; rows: any[] };
};

const BUDGET_REQUESTS = [
  { name: 'Rural road repair', request_amount: 4_000_000, readiness: 'ready', strategic_fit: 5, impact: 8, urgency: 4 },
  { name: 'School solar roofs', request_amount: 2_500_000, readiness: 'ready', strategic_fit: 4, impact: 7, urgency: 3 },
  { name: 'Clinic equipment', request_amount: 1_800_000, readiness: 'ready', strategic_fit: 5, impact: 9, urgency: 5 },
  { name: 'Office renovation', request_amount: 3_000_000, readiness: 'ready', strategic_fit: 2, impact: 3, urgency: 1 },
  { name: 'Flood barrier study', request_amount: 900_000, readiness: 'design', strategic_fit: 5, impact: 8, urgency: 5 },
  { name: 'Market hall upgrade', request_amount: 2_200_000, readiness: 'ready', strategic_fit: 3, impact: 5, urgency: 2 },
];

export const TEMPLATES: Tpl[] = [
  {
    key: 'budget', name: 'Budget screening', goal: 'Fund the requests that matter most within the budget ceiling', words: /budget|fund|allocat|project|งบ|โครงการ|จัดสรร/i,
    terms: [
      { term: 'requested amount', path: 'request_amount', type: 'number', unit: 'THB' },
      { term: 'readiness', path: 'readiness', type: 'text', values: ['ready', 'design', 'idea'] },
      { term: 'strategic fit', path: 'strategic_fit', type: 'number', unit: 'of 5' },
      { term: 'impact', path: 'impact', type: 'number', unit: 'of 10' },
      { term: 'urgency', path: 'urgency', type: 'number', unit: 'of 5' },
      { term: 'budget ceiling', path: 'ceiling', type: 'number', unit: 'THB' },
      { term: 'eligible', path: 'eligible', type: 'boolean' },
      { term: 'priority score', path: 'priority_score', type: 'number' },
    ],
    rules: [
      { name: 'Ready to fund', type: 'DECISION_TABLE', definition: { hitPolicy: 'FIRST', inputs: [{ name: 'readiness', type: 'string' }, { name: 'strategic_fit', type: 'number' }], outputs: [{ name: 'eligible', type: 'boolean' }],
          rules: [{ inputs: ['ready', '>= 3'], outputs: [true] }, { inputs: ['ELSE', 'ELSE'], outputs: [false] }] },
        tests: [{ name: 'Ready and fits strategy', input: { readiness: 'ready', strategic_fit: 4 }, expect: { eligible: true } }, { name: 'Still in design', input: { readiness: 'design', strategic_fit: 5 }, expect: { eligible: false } }] },
      { name: 'Priority score', type: 'FORMULA', definition: { lines: [{ name: 'priority_score', expr: 'impact * 10 + strategic_fit * 5' }] },
        tests: [{ name: 'High impact request', input: { impact: 8, strategic_fit: 5 }, expect: { priority_score: 105 } }] },
    ],
    strategy: { name: 'Budget allocation', steps: [
      ['input', { label: 'Requests' }],
      ['items', { label: 'Requests', from: 'input.requests' }],
      ['screen', { label: 'Ready to fund', condition: 'readiness == "ready" && strategic_fit >= 3', reason: 'Not ready, or strategic fit below 3' }],
      ['score', { label: 'Priority score', expression: 'impact * 10 + strategic_fit * 5', outputAs: 'priority_score' }],
      ['rank', { label: 'Rank', weights: [{ term: 'priority_score', weight: 1 }, { term: 'urgency', weight: 5 }] }],
      ['pick', { label: 'Allocate', mode: 'budget', budget: 'ceiling', cost: 'request_amount' }],
      ['output', { label: 'Result' }],
    ], tests: [{ name: 'Ten million ceiling', input: { ceiling: 10_000_000, requests: BUDGET_REQUESTS }, expect: { 'allocation.used': 8_300_000 } }] },
  },
  {
    key: 'loan', name: 'Loan approval', goal: 'Approve loans people can repay and set a safe limit', words: /loan|credit|lend|กู้|สินเชื่อ|เครดิต/i,
    terms: [
      { term: 'monthly income', path: 'monthly_income', type: 'number', unit: 'THB' },
      { term: 'monthly debt', path: 'monthly_debt', type: 'number', unit: 'THB' },
      { term: 'credit score', path: 'credit_score', type: 'number' },
      { term: 'debt ratio', path: 'debt_ratio', type: 'number', unit: '%' },
      { term: 'loan limit', path: 'loan_limit', type: 'number', unit: 'THB' },
      { term: 'approved', path: 'approved', type: 'boolean' },
    ],
    rules: [
      { name: 'Debt ratio and limit', type: 'FORMULA', definition: { lines: [{ name: 'debt_ratio', expr: 'ROUND(monthly_debt / monthly_income * 100, 1)' }, { name: 'loan_limit', expr: 'MIN(monthly_income * 10, 2000000)' }] },
        tests: [{ name: 'Income 30,000', input: { monthly_income: 30000, monthly_debt: 6000 }, expect: { debt_ratio: 20, loan_limit: 300000 } }] },
      { name: 'Who is approved', type: 'DECISION_TABLE', definition: { hitPolicy: 'FIRST', inputs: [{ name: 'credit_score', type: 'number' }, { name: 'debt_ratio', type: 'number' }], outputs: [{ name: 'approved', type: 'boolean' }],
          rules: [{ inputs: ['>= 650', '<= 40'], outputs: [true] }, { inputs: ['ELSE', 'ELSE'], outputs: [false] }] },
        tests: [{ name: 'Good score, low debt', input: { credit_score: 700, debt_ratio: 25 }, expect: { approved: true } }, { name: 'Low score', input: { credit_score: 580, debt_ratio: 20 }, expect: { approved: false } }] },
    ],
  },
  {
    key: 'eligibility', name: 'Benefit eligibility', goal: 'Decide who receives the benefit and how much', words: /eligib|benefit|welfare|สวัสดิการ|สิทธิ|เบี้ย/i,
    terms: [
      { term: 'age', path: 'age', type: 'number', unit: 'years' },
      { term: 'annual income', path: 'annual_income', type: 'number', unit: 'THB' },
      { term: 'eligible', path: 'eligible', type: 'boolean' },
      { term: 'monthly benefit', path: 'monthly_benefit', type: 'number', unit: 'THB' },
    ],
    rules: [
      { name: 'Who receives the benefit', type: 'DECISION_TABLE', definition: { hitPolicy: 'FIRST', inputs: [{ name: 'age', type: 'number' }, { name: 'annual_income', type: 'number' }], outputs: [{ name: 'eligible', type: 'boolean' }, { name: 'monthly_benefit', type: 'number' }],
          rules: [{ inputs: ['>= 80', '<= 100000'], outputs: [true, 1000] }, { inputs: ['>= 60', '<= 100000'], outputs: [true, 600] }, { inputs: ['ELSE', 'ELSE'], outputs: [false, 0] }] },
        tests: [{ name: 'Aged 82, low income', input: { age: 82, annual_income: 50000 }, expect: { eligible: true, monthly_benefit: 1000 } }, { name: 'Aged 45', input: { age: 45, annual_income: 50000 }, expect: { eligible: false } }] },
    ],
  },
];

export function list() { return TEMPLATES.map(t => ({ key: t.key, name: t.name, goal: t.goal, decisions: t.rules.length + (t.strategy ? 1 : 0), terms: t.terms.length })); }
export function match(description: string) { const d = String(description || ''); return (TEMPLATES.find(t => t.words.test(d)) || TEMPLATES[2]).key; }

const expectations = (e: Record<string, any>) => Object.entries(e).map(([path, value]) => ({ kind: 'equals' as const, path, value }));

export async function start(data: { projectId: string; template?: string; description?: string; name?: string }, user: AuthUser) {
  const p = await assertProjectAccess(data.projectId, user, 'write');
  const key = data.template || match(data.description || '');
  const tpl = TEMPLATES.find(t => t.key === key); if (!tpl) throw new ValidationError('Unknown template');
  const { upsertTerm } = await import('./vocabulary.js');
  const { createRule } = await import('../services/rules.service.js');
  const { createFlow } = await import('../services/flows.service.js');
  const { createCase } = await import('./testing.js');

  const topic = await prisma.topic.create({ data: { projectId: p.id, name: (data.name || '').trim() || tpl.name, goal: tpl.goal, description: data.description?.trim() || null, createdById: user.userId } });
  // existing terms are kept; a placeholder term (named like its field) gets the template's business name
  const have = new Map((await prisma.vocabularyTerm.findMany({ where: { projectId: p.id }, select: { id: true, path: true, term: true } })).map(x => [x.path, x]));
  for (const t of tpl.terms) {
    const ex = have.get(t.path);
    if (!ex) await upsertTerm({ projectId: p.id, term: t.term, path: t.path, type: t.type, unit: t.unit, values: t.values }, user).catch(() => {});
    else if (ex.term === ex.path) await prisma.vocabularyTerm.update({ where: { id: ex.id }, data: { term: t.term, type: t.type, unit: t.unit || null, values: t.values || [] } }).catch(() => {});
  }

  for (const r of tpl.rules) {
    const rule: any = await createRule({ project_id: p.id, name: r.name, type: r.type, definition: r.definition } as any, user);
    await prisma.rule.update({ where: { id: rule.id }, data: { topicId: topic.id } });
    for (const c of r.tests) await createCase({ name: c.name, targetType: 'rule', targetId: rule.id, input: c.input, expectations: expectations(c.expect) }, user).catch(() => {});
  }
  if (tpl.strategy) {
    const s = tpl.strategy; const ids = s.steps.map(([k], i) => `${k}${i}`);
    const graph = { nodes: s.steps.map(([type, d], i) => ({ id: ids[i], type, position: { x: 60 + i * 300, y: 120 }, data: { kind: type, ...d } })), edges: ids.slice(1).map((id, i) => ({ id: `e${i}`, source: ids[i], target: id })) };
    const f: any = await createFlow({ name: s.name, projectId: p.id, graph, kind: 'DECISION' } as any, user);
    await prisma.flow.update({ where: { id: f.id }, data: { topicId: topic.id } });
    for (const c of s.tests) await createCase({ name: c.name, targetType: 'decision_flow', targetId: f.id, input: c.input, expectations: expectations(c.expect) }, user).catch(() => {});
  }
  if (tpl.key === 'budget') {
    // sample requests as a data set, so Simulate has something to run on
    const ds = await import('../data/datasets-runtime.js');
    const slug = 'budget-requests';
    if (!(await ds.findDataset(p.id, slug))) {
      const d = await ds.ensureDataset(p.id, slug, ['name']);
      const snap = await ds.writeSnapshot(d.id, null, BUDGET_REQUESTS, ['name'], [], { source: 'template' }, 0);
      await ds.activate(d.id, snap.id);
    }
  }
  // run the new test cases so the topic opens with real results
  const { runForTarget } = await import('./testing.js');
  const rs = await prisma.rule.findMany({ where: { topicId: topic.id }, select: { id: true } });
  const fs = await prisma.flow.findMany({ where: { topicId: topic.id }, select: { id: true } });
  for (const r of rs) await runForTarget('rule', r.id).catch(() => {});
  for (const f of fs) await runForTarget('decision_flow', f.id).catch(() => {});
  return topic;
}
