// Triggers: flows (kind TRIGGER) that start on a schedule, a webhook, or by hand; and Data Set
// syncs (kind DATA). The scheduler only enqueues — workers run — so a crash never loses a run
// and the dedupe key stops the same minute running twice.
import crypto from 'node:crypto';
import { prisma } from '../config/database.js';
import { cronMatches } from '../data/cron.js';
import { runDataFlow } from '../data/dataflow.service.js';
import { enqueue, registerHandler, outbox } from './queue.js';
import { runArtifact } from './runner.js';

export function triggerConfig(flow: any): { type: string; cron?: string; events?: string[]; enabled?: boolean; secret?: string } {
  const start = (flow.graph?.nodes || []).find((n: any) => String(n.type).toLowerCase() === 'trigger');
  return { ...(flow.schedule || {}), ...(start?.data || {}) };
}

export async function runTrigger(flowId: string, reason: string, payload: any = {}) {
  const flow = await prisma.flow.findUnique({ where: { id: flowId } });
  if (!flow) throw new Error('Flow not found');
  if (flow.kind === 'DATA') return runDataFlow(flowId, { trigger: reason });
  const r = await runArtifact(flow.projectId, flow.id, { trigger: { reason, at: new Date().toISOString() }, body: payload }, { record: { targetType: 'trigger' } });
  await prisma.flow.update({ where: { id: flowId }, data: { lastRunAt: new Date() } });
  if (r.error) {
    const cfg = triggerConfig(flow) as any;
    if (cfg.notifyUrl) await outbox('webhook', cfg.notifyUrl, { event: 'trigger.failed', flow: flow.slug, error: r.error, executionId: r.executionId });
    throw new Error(r.error);
  }
  return r;
}

registerHandler('trigger.run', async (p) => { await runTrigger(p.flowId, p.reason, p.payload); });

let leader = false;
/** One scheduler per cluster: Postgres advisory lock; other replicas stay idle and take over if it dies. */
export function startTriggerScheduler() {
  if (process.env.XRULES_SCHEDULER === 'off') return;
  const tick = async () => {
    if (!leader) {
      const r = await prisma.$queryRawUnsafe<any[]>(`SELECT pg_try_advisory_lock(7710013) AS ok`);
      leader = !!r[0]?.ok; if (!leader) return;
    }
    const now = new Date(); const minute = now.toISOString().slice(0, 16);
    const { scheduleNightly } = await import('./testing.js'); await scheduleNightly(now);
    const { scheduleAlerts } = await import('./monitor.js'); await scheduleAlerts(now);
    const flows = await prisma.flow.findMany({ where: { kind: { in: ['TRIGGER', 'DATA'] }, status: 'PUBLISHED' } });
    for (const f of flows) {
      const c = triggerConfig(f);
      if (!c.cron || c.enabled === false || !cronMatches(c.cron, now)) continue;
      await enqueue('trigger.run', { flowId: f.id, reason: 'schedule' }, { dedupeKey: `trigger:${f.id}:${minute}` });
    }
  };
  setTimeout(() => { tick().catch(() => {}); setInterval(() => tick().catch(() => {}), 60_000); }, 60_000 - (Date.now() % 60_000) + 1000);
}

/** Webhook trigger: POST /hooks/{flowSlug} with X-Hook-Token equal to the trigger's secret. */
export async function webhook(slug: string, token: string | undefined, body: any) {
  const flow = await prisma.flow.findFirst({ where: { slug, kind: 'TRIGGER', status: 'PUBLISHED' } });
  if (!flow) return { status: 404 };
  const c = triggerConfig(flow);
  if (c.type !== 'webhook' || !c.secret || !token || !crypto.timingSafeEqual(Buffer.from(c.secret), Buffer.from(token.padEnd(c.secret.length).slice(0, c.secret.length)))) return { status: 401 };
  const job = await enqueue('trigger.run', { flowId: flow.id, reason: 'webhook', payload: body });
  return { status: 202, jobId: job.id };
}
