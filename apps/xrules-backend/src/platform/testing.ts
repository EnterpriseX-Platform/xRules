// Test cases for every target (rule, decision flow, API operation), suites, the publish gate
// and the nightly run. Cases run against the DRAFT — the thing that is about to be published.
import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError, AppError } from '../utils/errors.js';
import { assertProjectAccess } from '../services/_access.js';
import type { AuthUser } from '../middleware/auth.js';
import { runArtifact } from './runner.js';
import { enqueue, registerHandler, outbox } from './queue.js';

export interface Expectation { kind: 'status' | 'equals' | 'has_finding' | 'no_finding' | 'max_ms'; path?: string; value?: any; code?: string; severity?: string }

const read = (o: any, path = '') => path.replace(/^\$\.?/, '').split('.').filter(Boolean).reduce((a, k) => a?.[k], o);

function check(exp: Expectation, r: { status: number; body: any; ms: number }): { ok: boolean; message: string } {
  const findings: any[] = r.body?.findings || [];
  switch (exp.kind) {
    case 'status': return { ok: r.status === Number(exp.value), message: `status ${r.status} (expected ${exp.value})` };
    case 'equals': { const v = read(r.body, exp.path); return { ok: JSON.stringify(v) === JSON.stringify(exp.value), message: `${exp.path} = ${JSON.stringify(v)} (expected ${JSON.stringify(exp.value)})` }; }
    case 'has_finding': { const hit = findings.some(f => f.ruleCode === exp.code && (!exp.severity || f.severity === exp.severity)); return { ok: hit, message: hit ? `has ${exp.code}` : `missing ${exp.code}${exp.severity ? ` at ${exp.severity}` : ''}` }; }
    case 'no_finding': { const hit = findings.some(f => f.ruleCode === exp.code); return { ok: !hit, message: hit ? `should not have ${exp.code}` : `no ${exp.code}` }; }
    case 'max_ms': return { ok: r.ms <= Number(exp.value), message: `${r.ms} ms (max ${exp.value})` };
  }
  return { ok: false, message: `unknown expectation ${(exp as any).kind}` };
}

async function execute(c: any): Promise<{ status: number; body: any; ms: number; error?: string }> {
  const t0 = Date.now();
  if (c.targetType === 'rule' || (!c.targetType && c.ruleId)) {
    const { executeRule } = await import('../services/execute.service.js');
    try { const out = (await executeRule(c.ruleId || c.targetId, c.input, {}, { userId: '__system__', email: 'test@xrules', tenantId: '*', roles: ['OWNER'] } as any) as any).output; return { status: 200, body: out, ms: Date.now() - t0 }; }
    catch (e: any) { return { status: 500, body: null, ms: Date.now() - t0, error: e.message }; }
  }
  let projectId = c.projectId; let flowId = c.targetId; let input = c.input;
  if (c.targetType === 'operation') {
    const op = await prisma.apiOperation.findUnique({ where: { id: c.targetId }, include: { spec: true } });
    if (!op) throw new NotFoundError('Operation');
    projectId = op.spec.projectId; flowId = op.flowId;
    input = { params: c.input?.params || {}, query: c.input?.query || {}, body: c.input?.body ?? c.input ?? {} };
  }
  const r = await runArtifact(projectId, flowId, input, { draft: true, record: { targetType: 'test', forceTrace: true } });
  if (r.error) return { status: 500, body: null, ms: r.ms, error: r.error };
  if (r.output?.__apiResponse) return { status: r.output.status, body: r.output.body, ms: r.ms };
  return { status: 200, body: r.output, ms: r.ms };
}

export async function runCase(caseId: string) {
  const c = await prisma.testCase.findUnique({ where: { id: caseId } });
  if (!c) throw new NotFoundError('Test case');
  const exps: Expectation[] = (c.expectations as any) || (c.expected ? [{ kind: 'equals', path: '$', value: c.expected }] : []);
  const r = await execute(c);
  const checks = r.error ? [{ ok: false, message: r.error }] : exps.map(e => check(e, r));
  const pass = !r.error && checks.every(x => x.ok);
  const lastResult = { at: new Date().toISOString(), status: r.status, ms: r.ms, checks, output: r.body };
  await prisma.testCase.update({ where: { id: caseId }, data: { lastStatus: r.error ? 'ERROR' : pass ? 'PASS' : 'FAIL', lastResult: lastResult as any } });
  return { id: c.id, name: c.name, pass, ...lastResult };
}

async function casesFor(targetType: string, targetId: string) {
  if (targetType === 'rule') return prisma.testCase.findMany({ where: { OR: [{ ruleId: targetId }, { targetType: 'rule', targetId }] } });
  if (targetType === 'api_spec') { const ops = await prisma.apiOperation.findMany({ where: { specId: targetId } }); return prisma.testCase.findMany({ where: { targetType: 'operation', targetId: { in: ops.map(o => o.id) } } }); }
  return prisma.testCase.findMany({ where: { targetType, targetId } });
}

export async function runForTarget(targetType: string, targetId: string) {
  const cases = await casesFor(targetType, targetId);
  const results = [];
  for (const c of cases) results.push(await runCase(c.id));
  return { total: results.length, passed: results.filter(r => r.pass).length, results };
}

/** Publish gate: every test case of the target must pass. */
export async function assertTestsPass(targetType: string, targetId: string) {
  if (process.env.XRULES_TEST_GATE === 'off') return;
  const r = await runForTarget(targetType, targetId);
  if (r.passed < r.total) throw new AppError('TESTS_FAILED', `Tests failed: ${r.total - r.passed} of ${r.total} cases`, 409);
  return r;
}

// ---- CRUD
export async function createCase(data: { projectId: string; name: string; targetType: string; targetId: string; input: any; expectations: Expectation[]; suiteIds?: string[] }, user: AuthUser) {
  const p = await assertProjectAccess(data.projectId, user, 'write');
  if (!['rule', 'decision_flow', 'operation'].includes(data.targetType)) throw new ValidationError('targetType must be rule, decision_flow or operation');
  let targetId = data.targetId;
  if (data.targetType === 'decision_flow') { const f = await prisma.flow.findFirst({ where: { projectId: p.id, OR: [{ id: targetId }, { slug: targetId }] } }); if (!f) throw new NotFoundError('Flow'); targetId = f.id; }
  if (data.targetType === 'rule') { const r = await prisma.rule.findFirst({ where: { projectId: p.id, OR: [{ id: targetId }, { slug: targetId }] } }); if (!r) throw new NotFoundError('Rule'); targetId = r.id; }
  return prisma.testCase.create({ data: { name: data.name, projectId: p.id, targetType: data.targetType, targetId, ruleId: data.targetType === 'rule' ? targetId : null, input: data.input ?? {}, expectations: data.expectations as any, suiteIds: data.suiteIds || [] } });
}
export async function listCases(projectIdOrSlug: string, user: AuthUser, f: { targetType?: string; targetId?: string; suiteId?: string }) {
  const p = await assertProjectAccess(projectIdOrSlug, user);
  return prisma.testCase.findMany({ where: { projectId: p.id, ...(f.targetType ? { targetType: f.targetType } : {}), ...(f.targetId ? { targetId: f.targetId } : {}), ...(f.suiteId ? { suiteIds: { has: f.suiteId } } : {}) }, orderBy: { name: 'asc' } });
}
export async function updateCase(id: string, data: any, user: AuthUser) {
  const c = await prisma.testCase.findUnique({ where: { id } }); if (!c?.projectId) throw new NotFoundError('Test case');
  await assertProjectAccess(c.projectId, user, 'write');
  const u: any = {}; for (const k of ['name', 'input', 'expectations', 'suiteIds']) if (data[k] !== undefined) u[k] = data[k];
  return prisma.testCase.update({ where: { id }, data: u });
}

/** Run a suite (cases whose suiteIds contain it) and keep the run. */
export async function runSuite(suiteId: string, user: AuthUser | null) {
  const suite = await prisma.testSuite.findUnique({ where: { id: suiteId } });
  if (!suite) throw new NotFoundError('Test suite');
  if (user) await assertProjectAccess(suite.projectId, user);
  const run = await prisma.testRun.create({ data: { testSuiteId: suiteId, status: 'RUNNING', startedAt: new Date() } });
  const cases = await prisma.testCase.findMany({ where: { suiteIds: { has: suiteId } } });
  const results = []; for (const c of cases) results.push(await runCase(c.id));
  const passed = results.filter(r => r.pass).length;
  return prisma.testRun.update({ where: { id: run.id }, data: { status: passed === results.length ? 'SUCCESS' : 'FAILED', passed, failed: results.length - passed, totalRows: results.length, finishedAt: new Date(), coverage: { results } as any } });
}

// nightly: all suites; failures go to the outbox as webhook alerts if NIGHTLY_ALERT_URL is set
registerHandler('tests.nightly', async () => {
  for (const s of await prisma.testSuite.findMany()) {
    const r = await runSuite(s.id, null);
    if (r.failed && process.env.NIGHTLY_ALERT_URL) await outbox('webhook', process.env.NIGHTLY_ALERT_URL, { event: 'tests.nightly.failed', suite: s.name, failed: r.failed, total: r.totalRows });
  }
});
export async function scheduleNightly(now = new Date()) {
  if (now.getHours() === 2 && now.getMinutes() === 0) await enqueue('tests.nightly', {}, { dedupeKey: `nightly:${now.toISOString().slice(0, 10)}` });
}
