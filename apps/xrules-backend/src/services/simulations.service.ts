import axios from 'axios';
import { env } from '../config/env.js';
import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from './_access.js';
import type { AuthUser } from '../middleware/auth.js';

// Run a rule at a specific historical version (no execution log written — simulation is dry-run)
async function executeAtVersion(ruleId: string, version: number, input: any, _user: AuthUser): Promise<{ output: any }> {
  const rv = await prisma.ruleVersion.findUnique({ where: { ruleId_version: { ruleId, version } } });
  const rule = await prisma.rule.findUnique({ where: { id: ruleId } });
  if (!rule) throw new NotFoundError('Rule');
  const definition = rv?.definition ?? rule.definition;
  const resp = await axios.post(
    `${env.engineHubUrl}/api/v1/execute`,
    { rule: { type: rule.type, engine: rule.engine, definition }, input, context: { rule_id: rule.id, version } },
    { timeout: 30000 },
  );
  return { output: resp.data.output ?? resp.data };
}

interface DiffConfig { ruleId: string; versionA: number; versionB: number; input: any }
interface ReplayConfig { ruleId: string; versionA: number; versionB: number; sampleSize?: number }
interface SweepConfig { ruleId: string; version: number; baseInput: any; axis: string; values: any[] }

const fmt = (s: any) => ({
  id: s.id, name: s.name, kind: s.kind.toLowerCase(),
  config: s.config, status: s.status.toLowerCase(),
  result: s.result,
  startedAt: s.startedAt?.toISOString(), finishedAt: s.finishedAt?.toISOString(),
  projectId: s.projectId,
  createdAt: s.createdAt.toISOString(),
});

export async function list(projectIdOrSlug: string, user: AuthUser) {
  const project = await assertProjectAccess(projectIdOrSlug, user);
  const rows = await prisma.simulation.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  return rows.map(fmt);
}

export async function get(id: string, user: AuthUser) {
  const s = await prisma.simulation.findUnique({ where: { id } });
  if (!s) throw new NotFoundError('Simulation');
  await assertProjectAccess(s.projectId, user);
  return fmt(s);
}

// DIFF: same input, two versions, side-by-side output
export async function runDiff(projectId: string, name: string, config: DiffConfig, user: AuthUser) {
  await assertProjectAccess(projectId, user, 'write');
  const sim = await prisma.simulation.create({
    data: { name, kind: 'DIFF', config: config as any, status: 'RUNNING', startedAt: new Date(), projectId },
  });

  try {
    const [outA, outB] = await Promise.all([
      executeAtVersion(config.ruleId, config.versionA, config.input, user).catch(e => ({ error: e.message })),
      executeAtVersion(config.ruleId, config.versionB, config.input, user).catch(e => ({ error: e.message })),
    ]);
    const result = {
      input: config.input,
      versionA: { version: config.versionA, ...outA },
      versionB: { version: config.versionB, ...outB },
      diverged: JSON.stringify((outA as any)?.output) !== JSON.stringify((outB as any)?.output),
    };
    return fmt(await prisma.simulation.update({
      where: { id: sim.id },
      data: { status: 'SUCCESS', result, finishedAt: new Date() },
    }));
  } catch (e: any) {
    return fmt(await prisma.simulation.update({
      where: { id: sim.id },
      data: { status: 'FAILED', result: { error: e.message }, finishedAt: new Date() },
    }));
  }
}

// REPLAY: take last N production executions, run new version, compare
export async function runReplay(projectId: string, name: string, config: ReplayConfig, user: AuthUser) {
  await assertProjectAccess(projectId, user, 'write');
  const sim = await prisma.simulation.create({
    data: { name, kind: 'REPLAY', config: config as any, status: 'RUNNING', startedAt: new Date(), projectId },
  });

  const sample = config.sampleSize ?? 100;
  const recent = await prisma.execution.findMany({
    where: { ruleId: config.ruleId, status: 'SUCCESS' },
    orderBy: { createdAt: 'desc' },
    take: sample,
  });

  let diverged = 0;
  const samples: any[] = [];
  for (const ex of recent) {
    try {
      const [a, b] = await Promise.all([
        executeAtVersion(config.ruleId, config.versionA, ex.input, user).catch(() => null),
        executeAtVersion(config.ruleId, config.versionB, ex.input, user).catch(() => null),
      ]);
      const ao = JSON.stringify((a as any)?.output);
      const bo = JSON.stringify((b as any)?.output);
      if (ao !== bo) {
        diverged++;
        if (samples.length < 10) samples.push({ executionId: ex.id, input: ex.input, a: (a as any)?.output, b: (b as any)?.output });
      }
    } catch { /* skip */ }
  }

  const result = {
    total: recent.length, diverged,
    divergeRate: recent.length ? diverged / recent.length : 0,
    samples,
  };
  return fmt(await prisma.simulation.update({
    where: { id: sim.id },
    data: { status: 'SUCCESS', result, finishedAt: new Date() },
  }));
}

// SWEEP: vary one axis of input, plot output curve
export async function runSweep(projectId: string, name: string, config: SweepConfig, user: AuthUser) {
  await assertProjectAccess(projectId, user, 'write');
  const sim = await prisma.simulation.create({
    data: { name, kind: 'SWEEP', config: config as any, status: 'RUNNING', startedAt: new Date(), projectId },
  });

  const points: any[] = [];
  for (const value of config.values) {
    const input = { ...config.baseInput, [config.axis]: value };
    try {
      const out = await executeAtVersion(config.ruleId, config.version, input, user);
      points.push({ value, output: (out as any)?.output });
    } catch (e: any) {
      points.push({ value, error: e.message });
    }
  }

  const result = { axis: config.axis, points };
  return fmt(await prisma.simulation.update({
    where: { id: sim.id },
    data: { status: 'SUCCESS', result, finishedAt: new Date() },
  }));
}
