// npx tsx --test src/__tests__/library.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { materialize, deriveDiff, keysOf } from '../platform/library.js';
import { fillSettings } from '../platform/product-settings.js';

const row = (a: string, out: string) => ({ inputs: [a], outputs: [out] });
const lib = { inputs: [{ name: 'dsr' }], outputs: [{ name: 'reason' }], rules: [row('> 0.6', 'R1'), row('> 0.5', 'R2'), row('< 0', 'R3')] };

test('Extend keeps only the difference and the library flows through', () => {
  const local = { ...lib, rules: [row('> 0.6', 'R1'), row('> 0.55', 'R2'), row('< 0', 'R3'), row('= 9', 'P1')] };
  const d = deriveDiff('DECISION_TABLE', lib, local);
  assert.equal(d.off!.length, 1);
  assert.equal(d.added!.length, 2);
  assert.ok(d.added![0].replaces);
  const back = materialize('DECISION_TABLE', { definition: lib, version: 3 }, d, 'Portfolio');
  assert.deepEqual(back.definition.rules, local.rules);
  assert.deepEqual(back.origins, ['Library v3', 'Portfolio changed', 'Library v3', 'Portfolio added']);
  // library v4 adds a line: it reaches the product, the product's own lines stay
  const v4 = { ...lib, rules: [...lib.rules, row('> 0.9', 'R4')] };
  const m4 = materialize('DECISION_TABLE', { definition: v4, version: 4 }, d, 'Portfolio');
  assert.equal(m4.definition.rules.length, 5);
  assert.ok(m4.definition.rules.some((r: any) => r.outputs[0] === 'R4'));
});

test('Use = the library as it is', () => {
  const d = deriveDiff('FORMULA', { lines: [{ name: 'a', expr: '1' }] }, { lines: [{ name: 'a', expr: '1' }] });
  assert.equal(d.off!.length + d.added!.length, 0);
  assert.deepEqual(keysOf('FORMULA', [{ name: 'a' }, { name: 'a' }]), ['n:a', 'n:a#1']);
});

test('settings fill in for the product', () => {
  const def = { lines: [{ name: 'cap', expr: 'income * max DSR (bureau hit) of this product' }] };
  const rows = [{ name: 'max DSR (bureau hit)', values: { CLIP: 0.6, NA: 0.5 } }];
  assert.equal(fillSettings(def, rows, 'NA').lines[0].expr, 'income * 0.5');
  assert.throws(() => fillSettings(def, rows, 'Other'));
});
