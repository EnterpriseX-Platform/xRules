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

// Run a suite (synchronous for now — runs all rules against dataset rows)
export async function runSuite(id: string, datasetId: string | undefined, user: AuthUser) {
  const suite = await prisma.testSuite.findUnique({ where: { id }, include: { rules: { include: { rule: true } } } });
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
      testSuiteId: id, datasetId, status: 'RUNNING', startedAt: new Date(),
      totalRows: rows.length * suite.rules.length,
    },
  });

  // NOTE: Real execution happens via engine hub — for now we mock results.
  // Service callers should treat this as queued; engine will populate results.
  const results: any[] = [];
  let passed = 0, failed = 0, errored = 0;
  for (let i = 0; i < rows.length; i++) {
    for (const link of suite.rules) {
      // Stub: actual execution should call execute.service or engine directly.
      results.push({
        rowIndex: i, ruleId: link.ruleId, ruleVersion: link.version || link.rule.version,
        input: rows[i], status: 'PENDING' as const,
        testRunId: run.id,
      });
    }
  }

  if (results.length) {
    await prisma.testRunResult.createMany({ data: results });
  }

  const updated = await prisma.testRun.update({
    where: { id: run.id },
    data: { status: rows.length === 0 ? 'SUCCESS' : 'PENDING', passed, failed, errored, finishedAt: new Date() },
  });

  return updated;
}
