// Read-only catalogue for calling systems: with a `read` key a system lists published rules,
// their published versions and each version's input/output schema, then runs a pinned version.
import { test, expect, PROJECT, api } from './fixtures';
import type { Page } from '@playwright/test';
import { TEMPLATES } from '../../apps/xrules-studio/src/lib/templates';

const stamp = Date.now().toString(36);

async function key(page: Page, scopes: string[]) {
  const ws = await page.evaluate(() => JSON.parse(localStorage.getItem('xrules-auth') || '{}')?.state?.workspace?.slug);
  const k = await api(page, 'POST', '/api-keys', { name: `e2e-read-${scopes.join('-')}-${stamp}`, scopes, workspaceSlug: ws });
  expect(k.status, JSON.stringify(k.json)).toBe(201);
  return (k.json.data.key || k.json.data.rawKey || k.json.data.apiKey) as string;
}
async function pub(page: Page, apiKey: string, method: string, path: string, body?: any) {
  return page.evaluate(async ({ apiKey, method, path, body }) => {
    const r = await fetch(`${location.origin}/xrules-api/api/v1${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, { apiKey, method, path, body });
}

test('read key: list published rules, versions, schema; execute a pinned version', async ({ page }) => {
  await page.goto(`projects/${PROJECT}/rules`);
  const t = TEMPLATES.find(x => x.slug === 'fraud-score')!;
  const c = await api(page, 'POST', '/rules', { name: `e2e read ${stamp}`, type: t.type, projectId: PROJECT, definition: t.definition, input_schema: t.inputSchema, output_schema: t.outputSchema });
  expect(c.status, JSON.stringify(c.json)).toBe(201);
  const rule = c.json.data;

  const reader = await key(page, ['read', 'execute']);
  const executeOnly = await key(page, ['execute']);

  // not published yet → not in the catalogue
  let list = await pub(page, reader, 'GET', `/rules?q=${encodeURIComponent(`e2e read ${stamp}`)}`);
  expect(list.status).toBe(200);
  expect(list.json.data.find((r: any) => r.id === rule.id)).toBeUndefined();

  const p = await api(page, 'POST', `/rules/${rule.id}/publish`, {});
  expect(p.status, JSON.stringify(p.json)).toBeLessThan(300);

  list = await pub(page, reader, 'GET', `/rules?q=${encodeURIComponent(`e2e read ${stamp}`)}`);
  const row = list.json.data.find((r: any) => r.id === rule.id);
  expect(row, JSON.stringify(list.json)).toBeTruthy();
  expect(row.latestPublishedVersion).toBe(1);
  expect(row).not.toHaveProperty('definition');

  const vs = await pub(page, reader, 'GET', `/rules/${rule.id}/versions`);
  expect(vs.status).toBe(200);
  expect(vs.json.data.versions.map((v: any) => v.version)).toEqual([1]);
  expect(vs.json.data.versions[0].status).toBe('PUBLISHED');

  const v1 = await pub(page, reader, 'GET', `/rules/${rule.id}/versions/1`);
  expect(v1.status).toBe(200);
  expect(v1.json.data.inputSchema).toEqual(t.inputSchema);
  expect(v1.json.data.outputSchema).toEqual(t.outputSchema);
  expect(v1.json.data).not.toHaveProperty('definition');

  expect((await pub(page, reader, 'GET', `/rules/${rule.id}/versions/2`)).status).toBe(404);
  expect((await pub(page, reader, 'GET', `/rules/${rule.id}/versions/x`)).status).toBe(400);
  expect((await pub(page, reader, 'GET', `/rules/no-such-rule-${stamp}/versions`)).status).toBe(404);

  // execute-only key may not read the catalogue
  expect((await pub(page, executeOnly, 'GET', '/rules')).status).toBe(403);

  // the pinned version runs
  const sample = { countryRisk: 'low', velocityHourly: 1, newDevice: false, amount: 100 };
  const run = await pub(page, reader, 'POST', `/rules/${rule.id}/v/1/execute`, { data: sample });
  expect(run.status, JSON.stringify(run.json)).toBe(200);
  expect(run.json.version).toBe(1);
});
