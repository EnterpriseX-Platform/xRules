import { prisma } from '../config/database.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import { executeRule } from './execute.service.js';
import type { AuthUser } from '../middleware/auth.js';

export async function listTestCases(ruleId: string, user: AuthUser) {
  const rule = await prisma.rule.findUnique({
    where: { id: ruleId },
    include: { project: true },
  });
  if (!rule) throw new NotFoundError('Rule');

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: rule.project.workspaceId, userId: user.userId },
  });
  if (!membership) throw new ForbiddenError('Access denied');

  const tests = await prisma.testCase.findMany({
    where: { ruleId },
    orderBy: { createdAt: 'desc' },
  });

  return tests.map(t => ({
    id: t.id,
    name: t.name,
    input: t.input,
    expected: t.expected,
    lastResult: t.lastResult,
    lastStatus: t.lastStatus.toLowerCase(),
    createdAt: t.createdAt.toISOString(),
  }));
}

export async function createTestCase(
  ruleId: string,
  data: { name: string; input: object; expected?: object },
  user: AuthUser,
) {
  if (!data.name || !data.input) throw new ValidationError('Name and input are required');

  const rule = await prisma.rule.findUnique({
    where: { id: ruleId },
    include: { project: true },
  });
  if (!rule) throw new NotFoundError('Rule');

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: rule.project.workspaceId, userId: user.userId },
  });
  if (!membership) throw new ForbiddenError('Access denied');

  const testCase = await prisma.testCase.create({
    data: {
      name: data.name,
      input: data.input as any,
      expected: data.expected as any || null,
      ruleId,
    },
  });

  return {
    id: testCase.id,
    name: testCase.name,
    input: testCase.input,
    expected: testCase.expected,
    lastStatus: 'pending',
    createdAt: testCase.createdAt.toISOString(),
  };
}

export async function deleteTestCase(testId: string, user: AuthUser) {
  const testCase = await prisma.testCase.findUnique({
    where: { id: testId },
    include: { rule: { include: { project: true } } },
  });
  if (!testCase) throw new NotFoundError('Test case');

  const workspaceId = testCase.rule?.project.workspaceId
    ?? (testCase.projectId ? (await prisma.project.findUnique({ where: { id: testCase.projectId } }))?.workspaceId : undefined);
  const membership = workspaceId ? await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: user.userId },
  }) : null;
  if (!membership) throw new ForbiddenError('Access denied');

  await prisma.testCase.delete({ where: { id: testId } });
}

export async function runAllTests(ruleId: string, user: AuthUser) {
  const testCases = await prisma.testCase.findMany({ where: { ruleId } });

  const results = [];

  for (const tc of testCases) {
    try {
      const execResult = await executeRule(ruleId, tc.input, {}, user);
      const output = execResult.output;

      let status: 'PASS' | 'FAIL' = 'PASS';
      if (tc.expected) {
        // Deep compare expected vs actual output
        const expectedStr = JSON.stringify(tc.expected, Object.keys(tc.expected as any).sort());
        const actualStr = JSON.stringify(output, Object.keys(output as any || {}).sort());
        if (expectedStr !== actualStr) status = 'FAIL';
      }

      await prisma.testCase.update({
        where: { id: tc.id },
        data: { lastResult: output as any, lastStatus: status },
      });

      results.push({ id: tc.id, name: tc.name, status: status.toLowerCase(), output });
    } catch (err: any) {
      await prisma.testCase.update({
        where: { id: tc.id },
        data: { lastResult: { error: err.message } as any, lastStatus: 'ERROR' },
      });
      results.push({ id: tc.id, name: tc.name, status: 'error', error: err.message });
    }
  }

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const errors = results.filter(r => r.status === 'error').length;

  return { total: results.length, passed, failed, errors, results };
}
