// Decision Flow steps give the right answer when the flow is called as a published endpoint:
// API call → Transform → Rule → Branch → Run together/Merge → Output, plus the HTTP call step.
import { test, expect, PROJECT } from './fixtures';
import type { Page } from '@playwright/test';
import { api } from './fixtures';
import { TEMPLATES } from '../../apps/xrules-studio/src/lib/templates';

const stamp = Date.now().toString(36);
const T = (slug: string) => TEMPLATES.find(x => x.slug === slug)!;

async function rule(page: Page, name: string, slug: string) {
  const t = T(slug);
  const r = await api(page, 'POST', '/rules', { name, type: t.type, projectId: PROJECT, definition: t.definition, input_schema: t.inputSchema, output_schema: t.outputSchema });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json.data.slug as string;
}
async function publishedFlow(page: Page, name: string, graph: any) {
  const c = await api(page, 'POST', '/flows', { name, projectId: PROJECT, graph });
  expect(c.status, JSON.stringify(c.json)).toBe(201);
  const p = await api(page, 'POST', `/flows/${c.json.data.id}/publish`, {});
  expect(p.status, JSON.stringify(p.json)).toBeLessThan(300);
  return c.json.data.slug as string;
}
async function key(page: Page) {
  const ws = await page.evaluate(() => JSON.parse(localStorage.getItem('xrules-auth') || '{}')?.state?.workspace?.slug);
  const k = await api(page, 'POST', '/api-keys', { name: `e2e-key-nodes-${stamp}`, scopes: ['execute'], workspaceSlug: ws });
  expect(k.status, JSON.stringify(k.json)).toBe(201);
  return (k.json.data.key || k.json.data.rawKey || k.json.data.apiKey) as string;
}
async function call(page: Page, apiKey: string, flow: string, input: any) {
  return page.evaluate(async ({ apiKey, flow, input }) => {
    const r = await fetch(`${location.origin}/xrules-api/api/v1/flows/${flow}/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }, body: JSON.stringify({ input }) });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, { apiKey, flow, input });
}

test('Decision flow: transform, rule, branch, run together + merge, output', async ({ page }) => {
  await page.goto(`projects/${PROJECT}/flows?kind=DECISION`);
  const disc = await rule(page, `e2e node table ${stamp}`, 'discount-tiers');
  const fraud = await rule(page, `e2e node scorecard ${stamp}`, 'fraud-score');
  const graph = {
    nodes: [
      { id: 'in', type: 'input', data: {} },
      { id: 'tx', type: 'transform', data: { target: 'orderAmount', expression: 'input.qty * input.price' } },
      { id: 'par', type: 'parallel', data: { outputAs: 'checks' } },
      { id: 'r1', type: 'ruleCall', data: { ruleSlug: disc, outputAs: 'disc', inputMap: { customerTier: '{{input.customerTier}}', orderAmount: '{{orderAmount}}' } } },
      { id: 'r2', type: 'ruleCall', data: { ruleSlug: fraud, outputAs: 'fraud' } },
      { id: 'm', type: 'merge', data: {} },
      { id: 'b', type: 'branch', data: { condition: "checks.r2.decision === 'block' || checks.r2 && checks.r2.decision === 'block'" } },
      { id: 'stop', type: 'transform', data: { target: 'result', expression: "'stop'" } },
      { id: 'go', type: 'transform', data: { target: 'result', expression: "'go'" } },
      { id: 'o1', type: 'output', data: { return: { orderAmount: '{{orderAmount}}', checks: '{{checks}}', result: '{{result}}' } } },
      { id: 'o2', type: 'output', data: { return: { orderAmount: '{{orderAmount}}', checks: '{{checks}}', result: '{{result}}' } } },
    ],
    edges: [
      { source: 'in', target: 'tx' }, { source: 'tx', target: 'par' },
      { source: 'par', target: 'r1', sourceHandle: 'r1' }, { source: 'par', target: 'r2', sourceHandle: 'r2' },
      { source: 'r1', target: 'm' }, { source: 'r2', target: 'm' }, { source: 'm', target: 'b' },
      { source: 'b', target: 'stop', sourceHandle: 'true' }, { source: 'b', target: 'go', sourceHandle: 'false' },
      { source: 'stop', target: 'o1' }, { source: 'go', target: 'o2' },
    ],
  };
  const flow = await publishedFlow(page, `e2e nodes flow ${stamp}`, graph);
  const k = await key(page);

  const safe = await call(page, k, flow, { qty: 3, price: 400, customerTier: 'gold', countryRisk: 'low', velocityHourly: 1, newDevice: false, amount: 500 });
  expect(safe.status, JSON.stringify(safe.json)).toBe(200);
  const s = safe.json.output;
  expect(s.orderAmount, JSON.stringify(safe.json)).toBe(1200);                                  // transform
  expect(s.checks.r1).toMatchObject({ discountPercent: 10 });         // rule inside run-together, input mapped from the transform
  expect(s.checks.r2).toMatchObject({ decision: 'approve' });
  expect(s.result).toBe('go');                                       // branch false

  const risky = await call(page, k, flow, { qty: 1, price: 50, customerTier: 'bronze', countryRisk: 'high', velocityHourly: 12, newDevice: true, amount: 20000 });
  const r = risky.json.output;
  expect(r.checks.r2).toMatchObject({ decision: 'block' });
  expect(r.result).toBe('stop');                                     // branch true
});

test('Decision flow: HTTP call step fetches and keeps the response', async ({ page }) => {
  await page.goto(`projects/${PROJECT}/flows?kind=DECISION`);
  const graph = {
    nodes: [
      { id: 'in', type: 'input', data: {} },
      { id: 'h', type: 'http', data: { method: 'GET', url: 'http://xrules-api-svc:4000/health', outputAs: 'health' } },
      { id: 'o', type: 'output', data: { return: { health: '{{health}}' } } },
    ],
    edges: [{ source: 'in', target: 'h' }, { source: 'h', target: 'o' }],
  };
  const flow = await publishedFlow(page, `e2e http flow ${stamp}`, graph);
  const res = await call(page, await key(page), flow, { x: 1 });
  expect(res.status, JSON.stringify(res.json)).toBe(200);
  const out = res.json.output;
  expect(out.health, 'HTTP step left no response in the flow').toBeTruthy();
});
