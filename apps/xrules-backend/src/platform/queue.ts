// Durable work queue on Postgres: FOR UPDATE SKIP LOCKED, retries with backoff, dedupe keys.
// Plus an outbox for webhooks / notifications. Workers run in-process unless XRULES_WORKERS=off.
import os from 'node:os';
import { prisma } from '../config/database.js';

type Handler = (payload: any, job: { id: string; attempts: number }) => Promise<void>;
const handlers = new Map<string, Handler>();
const WORKER_ID = `${os.hostname()}:${process.pid}`;

export function registerHandler(queue: string, h: Handler) { handlers.set(queue, h); }

export async function enqueue(queue: string, payload: any, o: { dedupeKey?: string; runAt?: Date; maxAttempts?: number } = {}) {
  if (o.dedupeKey) {
    const ex = await prisma.queueJob.findUnique({ where: { dedupeKey: o.dedupeKey } });
    if (ex) return ex;
  }
  return prisma.queueJob.create({ data: { queue, payload, dedupeKey: o.dedupeKey, runAt: o.runAt ?? new Date(), maxAttempts: o.maxAttempts ?? 5 } });
}

async function claim(queues: string[], limit: number) {
  if (!queues.length) return [];
  return prisma.$queryRawUnsafe<any[]>(`
    UPDATE queue_jobs SET status = 'RUNNING', "lockedAt" = now(), "lockedBy" = $1, attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM queue_jobs
      WHERE status = 'READY' AND "runAt" <= now() AND queue = ANY($2::text[])
      ORDER BY "runAt" LIMIT $3 FOR UPDATE SKIP LOCKED)
    RETURNING id, queue, payload, attempts, "maxAttempts"`, WORKER_ID, queues, limit);
}

async function finish(id: string) { await prisma.queueJob.update({ where: { id }, data: { status: 'DONE', doneAt: new Date(), lockedAt: null } }); }
async function fail(job: any, err: any) {
  const last = job.attempts >= job.maxAttempts;
  await prisma.queueJob.update({ where: { id: job.id }, data: {
    status: last ? 'FAILED' : 'READY', lastError: String(err?.message || err).slice(0, 2000), lockedAt: null,
    runAt: new Date(Date.now() + Math.min(60_000 * 2 ** job.attempts, 30 * 60_000)),
  } });
}

let running = 0;
const MAX_PARALLEL = Number(process.env.XRULES_WORKER_PARALLEL || 4);

async function tick() {
  if (running >= MAX_PARALLEL) return;
  const jobs = await claim([...handlers.keys()], MAX_PARALLEL - running);
  for (const j of jobs) {
    running++;
    (async () => {
      try { await handlers.get(j.queue)!(j.payload, { id: j.id, attempts: j.attempts }); await finish(j.id); }
      catch (e) { await fail(j, e); }
      finally { running--; }
    })();
  }
}

// jobs stuck RUNNING (worker died) go back to READY after 10 minutes
async function reap() {
  await prisma.$executeRawUnsafe(`UPDATE queue_jobs SET status='READY', "lockedAt"=NULL WHERE status='RUNNING' AND "lockedAt" < now() - interval '10 minutes'`);
  await prisma.$executeRawUnsafe(`DELETE FROM queue_jobs WHERE status='DONE' AND "doneAt" < now() - interval '7 days'`);
}

// ---------------------------------------------------------------- outbox
export async function outbox(kind: string, target: string, payload: any) {
  return prisma.outbox.create({ data: { kind, target, payload } });
}
async function deliverOutbox() {
  const items = await prisma.outbox.findMany({ where: { sentAt: null, nextAt: { lte: new Date() }, attempts: { lt: 10 } }, take: 20 });
  for (const it of items) {
    try {
      if (it.kind === 'webhook') {
        const r = await fetch(it.target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(it.payload), signal: AbortSignal.timeout(10_000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      }
      await prisma.outbox.update({ where: { id: it.id }, data: { sentAt: new Date(), attempts: it.attempts + 1 } });
    } catch (e: any) {
      await prisma.outbox.update({ where: { id: it.id }, data: { attempts: it.attempts + 1, lastError: e.message, nextAt: new Date(Date.now() + 30_000 * 2 ** it.attempts) } });
    }
  }
}

export function startWorkers() {
  if (process.env.XRULES_WORKERS === 'off') return;
  setInterval(() => tick().catch(() => {}), 1000);
  setInterval(() => deliverOutbox().catch(() => {}), 5000);
  setInterval(() => reap().catch(() => {}), 60_000);
}
