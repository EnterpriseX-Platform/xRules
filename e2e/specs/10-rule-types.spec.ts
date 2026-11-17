// Every rule type gives the right answer: Decision Table, Decision Tree, Scorecard, Formula, Lookup, Script,
// AI Agent and Rule Flow (Model Call is in 07-ml). Each rule is created with a known definition, run with inputs
// whose answer is worked out by hand, and its designer opens without an error.
import { test, expect, noErrorOnScreen, shot, PROJECT } from './fixtures';
import type { Page } from '@playwright/test';
import { api } from './fixtures';
import { TEMPLATES } from '../../apps/xrules-studio/src/lib/templates';

const stamp = Date.now().toString(36);
const tpl = (slug: string) => { const t = TEMPLATES.find(x => x.slug === slug); if (!t) throw new Error(slug); return t; };

async function makeRule(page: Page, name: string, type: string, definition: any, schemas: { input_schema?: any; output_schema?: any } = {}) {
  const r = await api(page, 'POST', '/rules', { name, type, projectId: PROJECT, definition, ...schemas });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json.data as { id: string; slug: string };
}
async function run(page: Page, rule: { id: string }, input: any) {
  const r = await api(page, 'POST', '/execute', { rule_id: rule.id, input });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  return r.json.data.output;
}
async function designerOpens(page: Page, rule: { slug: string }, file: string) {
  await page.goto(`projects/${PROJECT}/rules/${rule.slug}`);
  await expect(page.locator('main h1, main [role=heading]').first()).toBeVisible();
  await noErrorOnScreen(page);
  await shot(page, file);
}

test('Decision Table: first-match hit policy picks the right row', async ({ page }) => {
  const t = tpl('discount-tiers');
  const rule = await makeRule(page, `e2e type table ${stamp}`, 'DECISION_TABLE', t.definition, { input_schema: t.inputSchema, output_schema: t.outputSchema });
  expect(await run(page, rule, { customerTier: 'gold', orderAmount: 600 })).toMatchObject({ discountPercent: 10, freeShipping: true });
  expect(await run(page, rule, { customerTier: 'gold', orderAmount: 100 })).toMatchObject({ discountPercent: 5, freeShipping: false });
  expect(await run(page, rule, { customerTier: 'platinum', orderAmount: 1000 })).toMatchObject({ discountPercent: 20 });
  await designerOpens(page, rule, '10-decision-table');
});

test('Decision Tree: IF / ELSE IF / ELSE', async ({ page }) => {
  const t = tpl('kyc-tier');
  const rule = await makeRule(page, `e2e type tree ${stamp}`, 'DECISION_TREE', t.definition, { input_schema: t.inputSchema, output_schema: t.outputSchema });
  expect(await run(page, rule, { country: 'IR', occupation: 'x', monthlyAmount: 10 })).toMatchObject({ tier: 'strict', requiresReview: true });
  expect(await run(page, rule, { country: 'TH', occupation: 'x', monthlyAmount: 60000 })).toMatchObject({ tier: 'enhanced', requiresReview: true });
  expect(await run(page, rule, { country: 'TH', occupation: 'x', monthlyAmount: 100 })).toMatchObject({ tier: 'basic', requiresReview: false });
  await designerOpens(page, rule, '10-decision-tree');
});

test('Scorecard: points add up and the threshold decides', async ({ page }) => {
  const t = tpl('fraud-score');
  const rule = await makeRule(page, `e2e type scorecard ${stamp}`, 'SCORECARD', t.definition, { input_schema: t.inputSchema, output_schema: t.outputSchema });
  expect(await run(page, rule, { countryRisk: 'high', velocityHourly: 12, newDevice: true, amount: 20000 })).toMatchObject({ score: 110, decision: 'block' });
  expect(await run(page, rule, { countryRisk: 'medium', velocityHourly: 5, newDevice: true, amount: 500 })).toMatchObject({ score: 40, decision: 'review' });
  expect(await run(page, rule, { countryRisk: 'low', velocityHourly: 1, newDevice: false, amount: 500 })).toMatchObject({ score: 0, decision: 'approve' });
  await designerOpens(page, rule, '10-scorecard');
});

test('Formula: expression with a condition', async ({ page }) => {
  const t = tpl('shipping-cost');
  const rule = await makeRule(page, `e2e type formula ${stamp}`, 'FORMULA', t.definition, { input_schema: t.inputSchema, output_schema: t.outputSchema });
  const out = await run(page, rule, { weightKg: 2, distanceKm: 100, express: true });
  expect(JSON.stringify(out)).toContain('224');                                   // 50 + 2*12 + 100*0.5 + 100
  expect(JSON.stringify(await run(page, rule, { weightKg: 1, distanceKm: 0, express: false }))).toContain('62');
  await designerOpens(page, rule, '10-formula');
});

test('Lookup: key finds its row', async ({ page }) => {
  const t = tpl('currency-rates');
  const rule = await makeRule(page, `e2e type lookup ${stamp}`, 'LOOKUP', t.definition, { input_schema: t.inputSchema, output_schema: t.outputSchema });
  expect(await run(page, rule, { code: 'THB' })).toMatchObject({ rate: 0.028, name: 'Thai Baht' });
  expect(await run(page, rule, { code: 'EUR' })).toMatchObject({ rate: 1.08 });
  await designerOpens(page, rule, '10-lookup');
});

test('Script: JavaScript policy', async ({ page }) => {
  const source = `let score = 0;
if (input.kyc !== 'enhanced') score += 30;
if (input.ageMonths < 6) score += 20;
if (input.amount > 10000) score += 25;
return { decision: score > 50 ? 'block' : score > 25 ? 'review' : 'approve', score };`;
  const rule = await makeRule(page, `e2e type script ${stamp}`, 'SCRIPT', { language: 'javascript', source });
  expect(await run(page, rule, { kyc: 'basic', ageMonths: 3, amount: 20000 })).toMatchObject({ decision: 'block', score: 75 });
  expect(await run(page, rule, { kyc: 'enhanced', ageMonths: 24, amount: 100 })).toMatchObject({ decision: 'approve', score: 0 });
  await designerOpens(page, rule, '10-script');
});

test('AI Agent: the model answers in the declared shape', async ({ page }) => {
  const t = tpl('sentiment-classifier');
  const rule = await makeRule(page, `e2e type ai ${stamp}`, 'AI_AGENT', t.definition, { input_schema: t.inputSchema, output_schema: t.outputSchema });
  const r = await api(page, 'POST', '/execute', { rule_id: rule.id, input: { feedback: 'Delivery was late twice and support never replied. Very disappointed.' } });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  expect(['positive', 'neutral', 'negative']).toContain(r.json.data.output?.sentiment);
  expect(r.json.data.output.sentiment).toBe('negative');
  await designerOpens(page, rule, '10-ai-agent');
});

test('Rule Flow: calls a rule, branches on its answer', async ({ page }) => {
  const t = tpl('discount-tiers');
  const table = await makeRule(page, `e2e type flowtable ${stamp}`, 'DECISION_TABLE', t.definition, { input_schema: t.inputSchema, output_schema: t.outputSchema });
  const graph = {
    nodes: [
      { id: 'in', type: 'input', data: {} },
      { id: 'call', type: 'ruleCall', data: { ruleSlug: table.slug, outputAs: 'disc' } },
      { id: 'b', type: 'branch', data: { condition: 'disc.discountPercent >= 10' } },
      { id: 'vip', type: 'transform', data: { target: 'segment', expression: "'vip'" } },
      { id: 'reg', type: 'transform', data: { target: 'segment', expression: "'regular'" } },
      { id: 'out1', type: 'output', data: {} },
      { id: 'out2', type: 'output', data: {} },
    ],
    edges: [
      { source: 'in', target: 'call' }, { source: 'call', target: 'b' },
      { source: 'b', target: 'vip', sourceHandle: 'true' }, { source: 'b', target: 'reg', sourceHandle: 'false' },
      { source: 'vip', target: 'out1' }, { source: 'reg', target: 'out2' },
    ],
  };
  const rule = await makeRule(page, `e2e type ruleflow ${stamp}`, 'RULE_FLOW', { graph });
  expect(await run(page, rule, { customerTier: 'platinum', orderAmount: 5000 })).toMatchObject({ segment: 'vip', disc: { discountPercent: 20 } });
  expect(await run(page, rule, { customerTier: 'silver', orderAmount: 5000 })).toMatchObject({ segment: 'regular', disc: { discountPercent: 3 } });
  await designerOpens(page, rule, '10-rule-flow');
});
