// A calling system runs a published decision table through the public execute API with every
// Studio hit policy (the API translates them to the engine's DMN names, as the Studio test run does).
import { test, expect, PROJECT, api } from './fixtures';
import type { Page } from '@playwright/test';

const stamp = Date.now().toString(36);

async function key(page: Page) {
  const ws = await page.evaluate(() => JSON.parse(localStorage.getItem('xrules-auth') || '{}')?.state?.workspace?.slug);
  const k = await api(page, 'POST', '/api-keys', { name: `e2e-hit-policy-${stamp}`, scopes: ['execute'], workspaceSlug: ws });
  expect(k.status, JSON.stringify(k.json)).toBe(201);
  return (k.json.data.key || k.json.data.rawKey || k.json.data.apiKey) as string;
}
async function run(page: Page, apiKey: string, path: string, body: any) {
  return page.evaluate(async ({ apiKey, path, body }) => {
    const r = await fetch(`${location.origin}/xrules-api/api/v1${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }, body: JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, { apiKey, path, body });
}

const definition = (hitPolicy: string) => ({
  hitPolicy,
  inputs: [{ name: 'amount', type: 'number' }],
  outputs: [{ name: 'decision', type: 'string' }],
  rules: [
    { id: 'r1', inputs: ['> 1000000'], outputs: ['review'] },
    { id: 'r2', inputs: ['_else_'], outputs: ['approve'] },
  ],
});

for (const hp of ['STANDARD', 'FIRST_MATCH', 'ARRAY', 'EVALUATE_ALL']) {
  test(`public execute: decision table with hit policy ${hp}`, async ({ page }) => {
    await page.goto(`projects/${PROJECT}/rules`);
    const c = await api(page, 'POST', '/rules', { name: `e2e hit ${hp} ${stamp}`, type: 'DECISION_TABLE', projectId: PROJECT, definition: definition(hp) });
    expect(c.status, JSON.stringify(c.json)).toBe(201);
    const rule = c.json.data;
    const p = await api(page, 'POST', `/rules/${rule.id}/publish`, {});
    expect(p.status, JSON.stringify(p.json)).toBeLessThan(300);
    const k = await key(page);

    for (const path of [`/rules/${rule.id}/execute`, `/rules/${rule.id}/v/1/execute`]) {
      const hi = await run(page, k, path, { data: { amount: 2000000 } });
      expect(hi.status, JSON.stringify(hi.json)).toBe(200);
      expect(JSON.stringify(hi.json.output)).toContain('review');
      if (hp !== 'EVALUATE_ALL') {
        const lo = await run(page, k, path, { data: { amount: 100 } });
        expect(lo.status, JSON.stringify(lo.json)).toBe(200);
        expect(JSON.stringify(lo.json.output)).toContain('approve');
      }
    }
  });
}
