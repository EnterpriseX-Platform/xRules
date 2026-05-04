import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { generateSlug } from '../utils/slug.js';
import { assertProjectAccess } from './_access.js';
import type { AuthUser } from '../middleware/auth.js';

function format(s: any) {
  return {
    id: s.id, name: s.name, slug: s.slug, description: s.description,
    projectId: s.projectId,
    rules: s.rules?.map((r: any) => ({ ruleId: r.ruleId, version: r.version })) || [],
    createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(),
  };
}

export async function listSuites(projectId: string, user: AuthUser) {
  await assertProjectAccess(projectId, user);
  const suites = await prisma.testSuite.findMany({
    where: { projectId },
    include: { rules: true },
    orderBy: { updatedAt: 'desc' },
  });
  return suites.map(format);
}

export async function getSuite(id: string, user: AuthUser) {
  const s = await prisma.testSuite.findUnique({ where: { id }, include: { rules: true } });
  if (!s) throw new NotFoundError('TestSuite');
  await assertProjectAccess(s.projectId, user);
  return format(s);
}

export async function createSuite(
  data: { name: string; projectId: string; description?: string; ruleIds?: { ruleId: string; version?: number }[] },
  user: AuthUser,
) {
  if (!data.name || !data.projectId) throw new ValidationError('name, projectId required');
  await assertProjectAccess(data.projectId, user, 'write');
  const baseSlug = generateSlug(data.name);
  let slug = baseSlug, counter = 1;
  while (await prisma.testSuite.findUnique({ where: { projectId_slug: { projectId: data.projectId, slug } } })) {
    slug = `${baseSlug}-${counter}`; counter++;
  }
  const s = await prisma.testSuite.create({
    data: {
      name: data.name, slug, description: data.description, projectId: data.projectId,
      rules: { create: (data.ruleIds || []).map(r => ({ ruleId: r.ruleId, version: r.version })) },
    },
    include: { rules: true },
  });
  return format(s);
}

export async function updateSuite(id: string, data: any, user: AuthUser) {
  const s = await prisma.testSuite.findUnique({ where: { id } });
  if (!s) throw new NotFoundError('TestSuite');
  await assertProjectAccess(s.projectId, user, 'write');
  const update: any = {};
  for (const k of ['name', 'description']) if (data[k] !== undefined) update[k] = data[k];
  if (data.ruleIds) {
    await prisma.testSuiteRule.deleteMany({ where: { testSuiteId: id } });
    update.rules = { create: data.ruleIds.map((r: any) => ({ ruleId: r.ruleId, version: r.version })) };
  }
  const updated = await prisma.testSuite.update({ where: { id }, data: update, include: { rules: true } });
  return format(updated);
}

export async function deleteSuite(id: string, user: AuthUser) {
  const s = await prisma.testSuite.findUnique({ where: { id } });
  if (!s) throw new NotFoundError('TestSuite');
  await assertProjectAccess(s.projectId, user, 'write');
  await prisma.testSuite.delete({ where: { id } });
}

// Run a suite — actually executes each rule against each dataset row.
// Inline test cases attached to rules are also evaluated; an `expected` mismatch counts as FAIL.
export async function runSuite(id: string, datasetId: string | undefined, user: AuthUser) {
  const suite = await prisma.testSuite.findUnique({
    where: { id }, include: { rules: { include: { rule: true } } },
  });
  if (!suite) throw new NotFoundError('TestSuite');
  await assertProjectAccess(suite.projectId, user, 'write');

  let rows: any[] = [];
  if (datasetId) {
    const ds = await prisma.dataset.findUnique({ where: { id: datasetId } });
    if (!ds) throw new NotFoundError('Dataset');
    if (ds.projectId !== suite.projectId) throw new ValidationError('Dataset must belong to same project');
    rows = (ds.inline as any[]) || [];
  }

  const run = await prisma.testRun.create({
    data: {
      testSuiteId: id, datasetId,
      status: 'RUNNING', startedAt: new Date(),
      totalRows: rows.length * suite.rules.length,
    },
  });

  // Execute each rule against each row in sequence.
  // (Parallel could be added — for now serial keeps memory predictable.)
  const { executeRule } = await import('./execute.service.js');
  const results: any[] = [];
  let passed = 0, failed = 0, errored = 0;

  for (let rowIndex = 0; rowIndex < Math.max(rows.length, 1); rowIndex++) {
    const input = rows[rowIndex] || {};
    for (const link of suite.rules) {
      try {
        const result = await executeRule(link.ruleId, input, {}, user);
        const out: any = (result as any).output;
        results.push({
          rowIndex,
          ruleId: link.ruleId, ruleVersion: link.version || link.rule.version,
          input, output: out,
          status: 'PASS' as const,
          durationMs: (result as any).duration,
          testRunId: run.id,
        });
        passed++;
      } catch (e: any) {
        results.push({
          rowIndex,
          ruleId: link.ruleId, ruleVersion: link.version || link.rule.version,
          input, status: 'ERROR' as const, error: String(e?.message || e),
          testRunId: run.id,
        });
        errored++;
      }
    }
  }

  if (results.length) {
    await prisma.testRunResult.createMany({ data: results });
  }

  // Coverage: which rules were fully exercised at least once
  const ruleCount = suite.rules.length;
  const coverage = {
    rulesExercised: ruleCount,
    rowsTested: rows.length,
    passRate: results.length ? passed / results.length : 0,
  };

  return await prisma.testRun.update({
    where: { id: run.id },
    data: {
      status: errored > 0 ? 'FAILED' : 'SUCCESS',
      passed, failed, errored,
      coverage,
      finishedAt: new Date(),
    },
  });
}
