// npx tsx --test src/__tests__/reasons.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCalc } from '../services/execute.service.js';
import { evaluateTable, matchCell } from '../services/table-eval.js';
import { compileExpr } from '../services/expr.js';
import { clearReasons } from '../platform/topic-run.js';

const sofar = { 'reasons so far': ['M005', 'E002'], 'outcomes so far': ['Reject'], 'top reason so far': 'E002', 'top outcome so far': 'Reject', line: 5000, min: 10000 };
const c = (e: string, input: any = sofar) => runCalc({ lines: [{ name: 'r', expr: e }] }, input).r;

test('reasons so far in formulas (111)', () => {
  assert.equal(c('has reason M005'), true);
  assert.equal(c('has reason E007'), false);
  assert.equal(c('has reason E007 or M005'), true);
  assert.equal(c('has a Reject reason'), true);
  assert.equal(c('has reason of outcome Refer'), false);
  assert.equal(c('IF(line < min and no Reject reason, 1, 0)'), 0);
  assert.equal(c('IF(line < min and no Reject reason, 1, 0)', { ...sofar, 'outcomes so far': [] }), 1);
  assert.equal(c('HAS_REASON("E002")'), true);
  assert.equal(c('top reason so far'), 'E002');
  assert.equal(c('COUNT(reasons so far)'), 2);
  assert.equal(c('IF(has reason M005, 1, 0)', {}), 0);  // outside a topic run: nothing raised
  assert.match(compileExpr('x = "has reason M005"', ['x']), /"has reason M005"/);
});
test('reasons so far in decision lines (111)', () => {
  assert.equal(matchCell('= M005', ['M005', 'E002']), true);
  assert.equal(matchCell('!= M005', ['M005']), false);
  assert.equal(matchCell('IN E007, E002', ['M005', 'E002']), true);
  assert.equal(matchCell('!IN E007, E003', ['M005']), true);
  assert.equal(matchCell('NULL', []), true);
});
test('decision lines clear reasons and set the decision (111)', () => {
  const def = { hitPolicy: 'FIRST', inputs: [{ name: 'shared' }], outputs: [], rules: [{ inputs: ['Y'], clear: ['outcome:Reject'], decision: 'Approve' }, { inputs: ['-'], reasons: ['E007'] }] };
  const o = evaluateTable(def, { shared: 'Y' }, []);
  assert.deepEqual(o.clear, ['outcome:Reject']); assert.equal(o.setDecision, 'Approve');
  const cat: any = { M005: 'Reject', E002: 'Reject', R001: 'Refer' };
  const codes = ['M005', 'R001', 'E002'];
  assert.deepEqual(clearReasons(codes, ['outcome:Reject'], x => ({ outcome: cat[x] })), ['M005', 'E002']);
  assert.deepEqual(codes, ['R001']);
  const all = ['A', 'B']; clearReasons(all, ['all'], () => ({})); assert.deepEqual(all, []);
  const one = ['A', 'B']; clearReasons(one, ['B'], () => ({})); assert.deepEqual(one, ['A']);
});
test('a second condition on the same word is AND (more)', () => {
  const def = { hitPolicy: 'FIRST', inputs: [{ name: 'line' }], outputs: [{ name: 'r' }], rules: [{ inputs: ['< 10000'], more: [{ name: 'line', cell: '>= 0' }], outputs: [1] }, { inputs: ['-'], outputs: [0] }] };
  assert.equal(evaluateTable(def, { line: 5000 }).r, 1);
  assert.equal(evaluateTable(def, { line: -5 }).r, 0);
});
test('calculation lines fail one by one; dependents say so; empty lines are reported (108/109)', () => {
  const o = runCalc({ lines: [{ name: 'a', expr: '1 + 1' }, { name: 'b', expr: 'NOPE(1)' }, { name: 'c', expr: 'b + 1' }, { name: 'd', expr: 'a * 2' }, { name: 'e', expr: '' }, { name: '', expr: 'a' }, { name: '', expr: '' }] }, {});
  assert.equal(o.a, 2); assert.equal(o.d, 4);
  assert.match(o._errors.b.error, /NOPE is not defined/);
  assert.equal(o._errors.c.error, 'depends on b (error)'); assert.equal(o._errors.c.dependsOn, 'b');
  assert.equal(o._errors.e.error, 'has no formula');
  assert.equal(o._errors['line 6'].error, 'has a formula but no result name');
  assert.equal(Object.keys(o._errors).length, 4);
});
test('text functions (107)', () => {
  const t = (e: string) => runCalc({ lines: [{ name: 'r', expr: e }] }, { s: ' HITTHICK--:0939:A ', n: 12345, p: 'ab,cd' }).r;
  assert.equal(t('LEFT(TRIM(s), 3)'), 'HIT');
  assert.equal(t('RIGHT(TRIM(s), 1)'), 'A');
  assert.equal(t('MID(TRIM(s), 4, 5)'), 'THICK');
  assert.equal(t('LEN(TRIM(s))'), 17);
  assert.equal(t('LEFT(n, 2)'), '12');
  assert.equal(t('UPPER("ab")'), 'AB'); assert.equal(t('lower("AB")'), 'ab');
  assert.equal(t('STARTSWITH(TRIM(s), "HIT")'), true);
  assert.equal(t('ITEM(s, 2)'), '0939'); assert.equal(t('ITEM(s, -1)'), 'A'); assert.equal(t('ITEM(p, 2, ",")'), 'cd');
  assert.equal(t('COUNT(SPLIT(s))'), 3); assert.equal(t('COUNT(SPLIT(p, ","))'), 2);
  assert.equal(t('CONTAINS(s, "0939")'), true); assert.equal(t('CONTAINS("abcdef", "cd")'), true); assert.equal(t('CONTAINS(SPLIT(p, ","), "ab")'), true);
});
