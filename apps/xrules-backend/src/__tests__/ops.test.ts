// npx tsx --test src/__tests__/ops.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diff, toZip, fromZip, readBundle } from '../platform/ops.js';
import { moduleOf, productionReadOnly } from '../modules/index.js';

const b = (parts: any) => ({ format: 'xrules-bundle' as const, version: 1 as const, exportedAt: '2026-11-29T00:00:00Z', source: { projectId: 'p', project: 'P', environment: 'QA' }, parts });

test('diff: added, removed, changed fields; version and status do not count', () => {
  const a = b({ rules: [{ key: 'r1', definition: { x: 1 }, version: 1, status: 'PUBLISHED' }, { key: 'r2', definition: {} }] }).parts;
  const c = b({ rules: [{ key: 'r1', definition: { x: 2 }, version: 2, status: 'DRAFT' }, { key: 'r3', definition: {} }] }).parts;
  const d = diff(a, c);
  assert.deepEqual(d.map(x => `${x.change}:${x.key}`).sort(), ['added:r3', 'changed:r1', 'removed:r2']);
  assert.deepEqual(d.find(x => x.key === 'r1')!.fields, ['definition']);
  assert.equal(diff(a, b({ rules: [{ key: 'r1', definition: { x: 1 }, version: 9 }, { key: 'r2', definition: {} }] }).parts).length, 0);
});

test('zip of readable YAML round-trips, one file per object', async () => {
  const src = b({ words: [{ key: 'monthly income', path: 'income', type: 'number' }], productSettings: [{ key: 'max DSR', tunable: true, values: { PL: 0.6 } }] });
  const back = await fromZip(await toZip(src));
  assert.deepEqual(back.parts, src.parts);
  assert.equal(back.source.environment, 'QA');
});

test('readBundle rejects duplicates and unknown kinds', async () => {
  await assert.rejects(readBundle({ bundle: b({ words: [{ key: 'a' }, { key: 'a' }] }) }), /twice/);
  await assert.rejects(readBundle({ bundle: b({ nope: [] }) }), /Unknown kind/);
  assert.ok(await readBundle({ bundle: b({ words: [] }) }));
});

test('production is read-only for decisions, open for live parameters and runs', () => {
  assert.equal(moduleOf('/platform/topics/abc/update')?.id, 'decisions');
  const call = (method: string, path: string) => { let code = 0; let passed = false; productionReadOnly({ method, path }, { status: (c: number) => { code = c; return { json: () => {} }; } }, () => { passed = true; }); return passed ? 200 : code; };
  const was = process.env.XRULES_ENV; process.env.XRULES_ENV = 'PRODUCTION';
  try {
    assert.equal(call('POST', '/platform/topics/abc/update'), 403);
    assert.equal(call('POST', '/platform/topics/abc/run'), 200);
    assert.equal(call('POST', '/platform/live-params/request'), 200);
    assert.equal(call('GET', '/rules/x'), 200);
  } finally { process.env.XRULES_ENV = was; }
  assert.equal(call('POST', '/platform/topics/abc/update'), 200);
});

test('topic keys: repeated names take the product, then a number', async () => {
  const { topicKeys } = await import('../platform/ops.js');
  const k = topicKeys([{ id: 'a', name: 'Card policy', product: 'GOLD' }, { id: 'b', name: 'Card policy', product: 'PLAT' }, { id: 'c', name: 'Card policy', product: 'PLAT' }, { id: 'd', name: 'Loan', product: null }]);
  assert.deepEqual([...k.values()], ['Card policy · GOLD', 'Card policy · PLAT', 'Card policy · PLAT #2', 'Loan']);
});
