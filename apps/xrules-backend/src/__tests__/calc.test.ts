// npx tsx --test src/__tests__/calc.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileExpr } from '../services/expr.js';
import { runCalc } from '../services/execute.service.js';
import { evaluateTable, withDecisionDate, DATE_FUNCS } from '../services/table-eval.js';

const app = { Application: { ProductType: '1: CreditCard', ApplicantType: 'Employee', 'Call Type': 'A', BasicSalary: 30000 }, employee_income: 36600, other: 1000 };
const calc = (expr: string, input: any = app, words: string[] = []) => runCalc({ lines: [{ name: 'r', expr }] }, input, words).r;

test('if … then … else with quoted text and dotted words', () => {
  assert.equal(calc('if Application.ProductType = "1: CreditCard" then 1 else 2'), 1);
  assert.equal(calc('If Application.ProductType = "2: Loan" then 1 else if Application.ApplicantType = "Employee" then 3 else 4'), 3);
});
test('IF( ) function with text compare', () => {
  assert.equal(calc('IF(Application.ApplicantType = "Employee", employee_income, 0)'), 36600);
  assert.equal(calc('if(Application.BasicSalary > 0, employee_income, other)'), 36600);
  assert.equal(calc('IF(Application.ApplicantType = "Housewife", employee_income, other × 0.2)'), 200);
});
test('words with spaces, and / or', () => {
  assert.equal(calc('IF(Application.Call Type = "A" and Application.BasicSalary ≥ 30000, 1, 0)', app, ['Application.Call Type']), 1);
  assert.equal(calc('Application.Call Type = "B" or Application.BasicSalary > 1', app, ['Application.Call Type']), true);
});
test('text in quotes is never turned into words', () => {
  assert.match(compileExpr('x = "Application and if"', ['x']), /"Application and if"/);
});
test('missing word is empty, not an error', () => {
  assert.equal(calc('IF(nothing_here > 0, 1, 2)'), 2);
});
test('pairs and days count from the decision date', () => {
  const input = { codes: '003:001', dates: '20251015:20200101' };
  const r = withDecisionDate('2025-11-26', () => runCalc({ lines: [{ name: 'n', expr: 'COUNT_PAIRS(codes, dates, "001=365,003=90")' }, { name: 'd', expr: 'DAYS(20251116)' }] }, input));
  assert.equal(r.n, 1); assert.equal(r.d, 10);
  assert.equal(withDecisionDate('2025-11-26', () => DATE_FUNCS.TODAY()).toISOString().slice(0, 10), '2025-11-26');
});
test('decision result is worked out from words and formulas', () => {
  const def = { hitPolicy: 'FIRST', inputs: [{ name: 'Application.ApplicantType' }], outputs: [{ name: 'FinalIncome' }],
    rules: [{ inputs: ['Employee'], outputs: ['employee income'] }, { inputs: ['Housewife'], outputs: ['basic salary × 0.2'] }, { inputs: ['-'], outputs: ['"employee income"'] }] };
  const cat: any = Object.assign([], { project: { aggs: {}, sets: {}, words: [{ term: 'employee income', path: 'employee_income' }, { term: 'basic salary', path: 'Application.BasicSalary' }] } });
  assert.equal(evaluateTable(def, app, cat).FinalIncome, 36600);
  assert.equal(evaluateTable(def, { ...app, Application: { ...app.Application, ApplicantType: 'Housewife' } }, cat).FinalIncome, 6000);
  assert.equal(evaluateTable(def, { ...app, Application: { ApplicantType: 'X' } }, cat).FinalIncome, 'employee income');
});
import { byDependency } from '../platform/topic-run.js';
test('a calculation used by a decision in the same step runs first', () => {
  const rules = [{ id: 'd', definition: { inputs: [{ name: 'income' }], outputs: [{ name: 'decision' }], rules: [] } }, { id: 'c', definition: { lines: [{ name: 'income', expr: 'a + b' }] } }, { id: 'x', definition: { lines: [{ name: 'y', expr: '1' }] } }];
  assert.deepEqual(byDependency(['d', 'x', 'c'], rules), ['c', 'd', 'x']);
});

test('numbers typed in test cases are numbers (86)', () => {
  const words = Object.assign(['basic salary', 'fixed income', 'other income', 'code'], { types: { 'basic salary': 'number', 'fixed income': 'number', 'other income': 'number', code: 'text' } });
  const input = { 'basic salary': '30000', 'fixed income': '5000', 'other income': '', code: '001', plain: '1600' };
  const c = (e: string) => runCalc({ lines: [{ name: 'r', expr: e }] }, input, words as any).r;
  assert.equal(c('basic salary + fixed income + 0.8 × other income'), 35000);
  assert.equal(c('SUM(basic salary, fixed income)'), 35000);
  assert.equal(c('AVG(basic salary, fixed income)'), 17500);
  assert.equal(c('AVERAGE(basic salary, fixed income)'), 17500);
  assert.equal(c('Average(basic salary, fixed income)'), 17500);
  assert.equal(c('plain + 1'), 1601);
  assert.equal(c('code = "001"'), true);
  assert.equal(c('SUM(list, "v")'), 0);
  assert.equal(runCalc({ lines: [{ name: 'r', expr: 'SUM(items, "v")' }] }, { items: [{ v: '2' }, { v: 3 }] }).r, 5);
});
test('OR( ) and AND( ) functions; or / and between values (87)', () => {
  const c = (e: string) => runCalc({ lines: [{ name: 'r', expr: e }] }, { b: 'B003', n: 5 }).r;
  assert.equal(c('IF(OR(b = "A002", b = "B003"), 0.3, 0.1)'), 0.3);
  assert.equal(c('IF(AND(n > 1, n < 3), 1, 0)'), 0);
  assert.equal(c('n > 1 or (n < 0)'), true);
  assert.equal(c('n > 1 and (n < 3)'), false);
});
