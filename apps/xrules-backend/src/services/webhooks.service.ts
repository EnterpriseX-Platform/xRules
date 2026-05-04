// Webhook CRUD + dispatcher with HMAC-SHA256 signing and exponential retry.
import crypto from 'node:crypto';
import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { assertWorkspaceAccess } from './_access.js';
import type { AuthUser } from '../middleware/auth.js';

const RETRY_DELAYS_MS = [1_000, 5_000, 30_000, 5 * 60_000, 30 * 60_000]; // 5 attempts: 1s, 5s, 30s, 5m, 30m
const DELIVERY_TIMEOUT = Number(process.env.WEBHOOK_DELIVERY_TIMEOUT_MS || 10_000);

const fmt = (w: any, includeSecret = false) => ({
  id: w.id, name: w.name, url: w.url, events: w.events,
  active: w.active, ruleIds: w.ruleIds || [],
  workspaceId: w.workspaceId,
  createdAt: w.createdAt.toISOString(), updatedAt: w.updatedAt.toISOString(),
  // Secret returned only on creation (then never again).
  secret: includeSecret ? w.secret : undefined,
});

export async function list(workspaceId: string, user: AuthUser) {
  await assertWorkspaceAccess(workspaceId, user);
  const rows = await prisma.webhook.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } });
  return rows.map(w => fmt(w));
}

export async function create(
  data: { workspaceId: string; name: string; url: string; events: string[]; ruleIds?: string[] },
  user: AuthUser,
) {
  if (!data.workspaceId || !data.name || !data.url || !data.events?.length) {
    throw new ValidationError('workspaceId, name, url, events required');
  }
  await assertWorkspaceAccess(data.workspaceId, user, 'admin');
  const secret = 'whsec_' + crypto.randomBytes(24).toString('base64url');
  const w = await prisma.webhook.create({
    data: {
      name: data.name, url: data.url, events: data.events, secret,
      ruleIds: data.ruleIds || [], active: true,
      workspaceId: data.workspaceId,
    },
  });
  return fmt(w, true); // include secret one time
}

export async function update(id: string, data: any, user: AuthUser) {
  const w = await prisma.webhook.findUnique({ where: { id } });
  if (!w) throw new NotFoundError('Webhook');
  await assertWorkspaceAccess(w.workspaceId, user, 'admin');
  const u: any = {};
  for (const k of ['name', 'url', 'events', 'active', 'ruleIds']) if (data[k] !== undefined) u[k] = data[k];
  return fmt(await prisma.webhook.update({ where: { id }, data: u }));
}

export async function remove(id: string, user: AuthUser) {
  const w = await prisma.webhook.findUnique({ where: { id } });
  if (!w) throw new NotFoundError('Webhook');
  await assertWorkspaceAccess(w.workspaceId, user, 'admin');
  await prisma.webhook.delete({ where: { id } });
}

// Dispatcher: send an event to all matching webhooks. Fire-and-forget.
// Caller should NOT await this — it spawns background tasks.
export function dispatch(event: string, payload: any, opts: { workspaceId: string; ruleId?: string }) {
  setImmediate(async () => {
    try {
      const hooks = await prisma.webhook.findMany({
        where: { workspaceId: opts.workspaceId, active: true, events: { has: event } },
      });
      for (const hook of hooks) {
        // Filter by ruleIds if specified
        if (hook.ruleIds.length && opts.ruleId && !hook.ruleIds.includes(opts.ruleId)) continue;
        deliverWithRetry(hook, event, payload).catch(e => console.error('[webhook]', e));
      }
    } catch (e) {
      console.error('[webhook dispatcher]', e);
    }
  });
}

async function deliverWithRetry(hook: any, event: string, payload: any) {
  const body = JSON.stringify({
    id: 'evt_' + crypto.randomBytes(8).toString('hex'),
    event,
    timestamp: new Date().toISOString(),
    data: payload,
  });
  const signature = signHmac(hook.secret, body);

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    try {
      const ctrl = new AbortController();
      const tmr = setTimeout(() => ctrl.abort(), DELIVERY_TIMEOUT);
      const res = await fetch(hook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-XRules-Event': event,
          'X-XRules-Signature': `sha256=${signature}`,
          'X-XRules-Delivery': hook.id + ':' + Date.now(),
          'User-Agent': 'XRules-Webhook/1.0',
        },
        body,
        signal: ctrl.signal,
      });
      clearTimeout(tmr);
      if (res.ok) return;
      // Treat 4xx other than 408/429 as terminal — don't retry validation errors.
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        console.warn(`[webhook] ${hook.url} returned ${res.status}; not retrying`);
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (e: any) {
      if (attempt === RETRY_DELAYS_MS.length - 1) {
        console.error(`[webhook] ${hook.url} failed after ${RETRY_DELAYS_MS.length} attempts: ${e.message}`);
        return;
      }
      await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
}

function signHmac(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}
