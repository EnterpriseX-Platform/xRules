// Async Jobs for Integration Flows. State machine:
// WAITING → RUNNING → COMPLETED|ERROR|CANCELLED  (CANCELLING is a transient).
import axios from 'axios';
import { env } from '../config/env.js';
import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from './_access.js';
import type { AuthUser } from '../middleware/auth.js';

const fmt = (j: any) => ({
  id: j.id,
  state: j.state,
  statusCode: j.statusCode,
  input: j.input, output: j.output, error: j.error, trace: j.trace,
  startedAt: j.startedAt?.toISOString(), finishedAt: j.finishedAt?.toISOString(),
  flowId: j.flowId, flowVersion: j.flowVersion,
  projectId: j.projectId,
  correlationId: j.correlationId,
  createdAt: j.createdAt.toISOString(),
});

// Async runner — fires off Integration Flow execution in the background.
// Engine integration is stubbed; in production this would be a queue worker.
async function runAsync(jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { flow: true } });
  if (!job || job.state !== 'WAITING') return;

  await prisma.job.update({
    where: { id: jobId },
    data: { state: 'RUNNING', startedAt: new Date() },
  });

  try {
    if (!job.flow) throw new Error('Flow missing');
    const resp = await axios.post(
      `${env.engineHubUrl}/api/v1/execute`,
      {
        rule: { type: 'WORKFLOW', engine: 'flow', definition: job.flow.graph },
        input: job.input,
        context: { flow_id: job.flowId, version: job.flowVersion, correlation_id: job.correlationId },
      },
      { timeout: 1000 * 60 * 30 }, // 30 min for integration flows
    );
    await prisma.job.update({
      where: { id: jobId },
      data: {
        state: 'COMPLETED', statusCode: 'JOB_SUCCESS',
        output: resp.data.output ?? resp.data,
        finishedAt: new Date(),
      },
    });
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || 'Job failed';
    const code = msg.includes('timeout') ? 'JOB_TIMEOUT'
      : msg.includes('validation') ? 'JOB_VALIDATION_ERROR'
      : 'JOB_ERROR';
    await prisma.job.update({
      where: { id: jobId },
      data: {
        state: 'ERROR', statusCode: code, error: msg,
        finishedAt: new Date(),
      },
    });
  }
}

export async function start(
  flowId: string,
  version: number | undefined,
  input: any,
  correlationId: string | undefined,
  user: AuthUser,
) {
  const flow = await prisma.flow.findUnique({ where: { id: flowId } });
  if (!flow) throw new NotFoundError('Flow');
  if (flow.kind !== 'INTEGRATION') throw new ValidationError('Only Integration Flows support async Jobs');
  await assertProjectAccess(flow.projectId, user, 'write');

  const job = await prisma.job.create({
    data: {
      projectId: flow.projectId,
      flowId, flowVersion: version || flow.version,
      input: input || {},
      correlationId,
      state: 'WAITING',
    },
  });

  // Fire-and-forget background execution
  setImmediate(() => runAsync(job.id).catch(console.error));

  return fmt(job);
}

export async function get(id: string, user: AuthUser) {
  const j = await prisma.job.findUnique({ where: { id } });
  if (!j) throw new NotFoundError('Job');
  await assertProjectAccess(j.projectId, user);
  return fmt(j);
}

export async function list(projectId: string, user: AuthUser, state?: string) {
  await assertProjectAccess(projectId, user);
  const where: any = { projectId };
  if (state) where.state = state.toUpperCase();
  const rows = await prisma.job.findMany({
    where, orderBy: { createdAt: 'desc' }, take: 100,
  });
  return rows.map(fmt);
}

export async function cancel(id: string, user: AuthUser) {
  const j = await prisma.job.findUnique({ where: { id } });
  if (!j) throw new NotFoundError('Job');
  await assertProjectAccess(j.projectId, user, 'write');
  if (j.state !== 'WAITING' && j.state !== 'RUNNING') {
    throw new ValidationError(`Cannot cancel job in state ${j.state}`);
  }
  return fmt(await prisma.job.update({
    where: { id },
    data: {
      state: 'CANCELLED', statusCode: 'JOB_USER_CANCELED',
      finishedAt: new Date(),
    },
  }));
}

export async function cancelAllInSpace(projectId: string, user: AuthUser) {
  await assertProjectAccess(projectId, user, 'admin');
  const result = await prisma.job.updateMany({
    where: { projectId, state: 'WAITING' },
    data: {
      state: 'CANCELLED', statusCode: 'JOB_USER_CANCELED',
      finishedAt: new Date(),
    },
  });
  return { cancelled: result.count };
}

export async function cancelAllForFlow(flowId: string, version: number | undefined, user: AuthUser) {
  const flow = await prisma.flow.findUnique({ where: { id: flowId } });
  if (!flow) throw new NotFoundError('Flow');
  await assertProjectAccess(flow.projectId, user, 'write');
  const where: any = { flowId, state: 'WAITING' };
  if (version) where.flowVersion = version;
  const result = await prisma.job.updateMany({
    where, data: { state: 'CANCELLED', statusCode: 'JOB_USER_CANCELED', finishedAt: new Date() },
  });
  return { cancelled: result.count };
}
