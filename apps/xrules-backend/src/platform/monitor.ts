// Monitoring: overview, API traffic, decisions, data health, alerts, /metrics.
// Aggregates straight from executions with Postgres percentile functions (indexes on
// operationId/targetType + createdAt). TimescaleDB continuous aggregates can replace these later.
import { prisma } from '../config/database.js';
import { assertProjectAccess } from '../services/_access.js';
import type { AuthUser } from '../middleware/auth.js';
import { enqueue, registerHandler, outbox } from './queue.js';

const since = (h: number) => new Date(Date.now() - h * 3600_000);

export async function traffic(projectIdOrSlug: string, user: AuthUser, hours = 24) {
  const p = await assertProjectAccess(projectIdOrSlug, user);
  const ops = await prisma.$queryRawUnsafe<any[]>(`
    SELECT o.id, o.method, o.path, s.name AS spec, s."basePath", s.version,
      count(e.id)::int AS calls,
      count(e.id) FILTER (WHERE e.status <> 'SUCCESS')::int AS errors,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY e.duration) AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY e.duration) AS p95,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY e.duration) AS p99
    FROM api_operations o JOIN api_specs s ON s.id = o."specId"
    LEFT JOIN executions e ON e."operationId" = o.id AND e."createdAt" >= $2 AND e."targetType" = 'operation'
    WHERE s."projectId" = $1 GROUP BY o.id, s.id ORDER BY calls DESC`, p.id, since(hours));
  const keys = await prisma.$queryRawUnsafe<any[]>(`
    SELECT k.id, k.name, k."systemName", k.prefix, count(e.id)::int AS calls, count(e.id) FILTER (WHERE e.status <> 'SUCCESS')::int AS errors
    FROM executions e JOIN api_keys k ON k.id = e."apiKeyId" JOIN api_operations o ON o.id = e."operationId" JOIN api_specs s ON s.id = o."specId"
    WHERE s."projectId" = $1 AND e."createdAt" >= $2 GROUP BY k.id ORDER BY calls DESC`, p.id, since(hours));
  const series = await prisma.$queryRawUnsafe<any[]>(`
    SELECT date_trunc('hour', e."createdAt") AS t, count(*)::int AS calls, count(*) FILTER (WHERE e.status <> 'SUCCESS')::int AS errors,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY e.duration) AS p95
    FROM executions e JOIN api_operations o ON o.id = e."operationId" JOIN api_specs s ON s.id = o."specId"
    WHERE s."projectId" = $1 AND e."createdAt" >= $2 GROUP BY 1 ORDER BY 1`, p.id, since(hours));
  return { hours, operations: ops.map(n), keys, series: series.map(n) };
}
const n = (r: any) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v instanceof Date ? v.toISOString() : v === null ? null : typeof v === 'object' && v && 'toNumber' in (v as any) ? (v as any).toNumber() : v]));

export async function decisions(projectIdOrSlug: string, user: AuthUser, hours = 24 * 7) {
  const p = await assertProjectAccess(projectIdOrSlug, user);
  const byRule = await prisma.$queryRawUnsafe<any[]>(`
    SELECT f->>'ruleCode' AS code, f->>'severity' AS severity, count(*)::int AS n
    FROM executions e JOIN flows fl ON fl.id = e."flowId", jsonb_array_elements(COALESCE(e.findings, '[]'::jsonb)) f
    WHERE fl."projectId" = $1 AND e."createdAt" >= $2 AND e."targetType" IS DISTINCT FROM 'challenger' AND e."targetType" IS DISTINCT FROM 'test'
    GROUP BY 1, 2 ORDER BY n DESC`, p.id, since(hours));
  const totals = await prisma.$queryRawUnsafe<any[]>(`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE (e.output->>'passed') = 'false' OR (e.output->'body'->>'passed') = 'false')::int AS failed
    FROM executions e JOIN flows fl ON fl.id = e."flowId"
    WHERE fl."projectId" = $1 AND e."createdAt" >= $2 AND e.findings IS NOT NULL AND e."targetType" IS DISTINCT FROM 'challenger' AND e."targetType" IS DISTINCT FROM 'test'`, p.id, since(hours));
  const byAgency = await prisma.$queryRawUnsafe<any[]>(`
    SELECT COALESCE(e.input->'context'->>'agencyCode', e.input->'body'->'context'->>'agencyCode') AS agency, count(*)::int AS n,
      count(*) FILTER (WHERE jsonb_array_length(COALESCE(e.findings, '[]'::jsonb)) > 0)::int AS with_findings
    FROM executions e JOIN flows fl ON fl.id = e."flowId"
    WHERE fl."projectId" = $1 AND e."createdAt" >= $2 AND e.findings IS NOT NULL GROUP BY 1 ORDER BY with_findings DESC LIMIT 30`, p.id, since(hours));
  return { hours, totals: totals[0], byRule, byAgency };
}

export async function dataHealth(projectIdOrSlug: string, user: AuthUser) {
  const p = await assertProjectAccess(projectIdOrSlug, user);
  const sets = await prisma.dataset.findMany({ where: { projectId: p.id } });
  const out = [];
  for (const d of sets) {
    const latest = await prisma.datasetSnapshot.findFirst({ where: { datasetId: d.id }, orderBy: { createdAt: 'desc' } });
    const active = d.activeSnapshotId ? await prisma.datasetSnapshot.findUnique({ where: { id: d.activeSnapshotId } }) : null;
    out.push({ id: d.id, slug: d.slug, rows: d.rowCount, activeAt: active?.createdAt.toISOString() ?? null,
      ageHours: active ? Math.round((Date.now() - active.createdAt.getTime()) / 36e5) : null,
      lastStatus: latest?.status ?? null, lastAt: latest?.createdAt.toISOString() ?? null, rejectedRows: latest?.rejectedCount ?? 0,
      stale: !!latest && !!active && latest.id !== active.id && latest.status === 'REJECTED' });
  }
  const conns = (await prisma.connection.findMany({ where: { projectId: p.id } })).map(c => ({ id: c.id, slug: c.slug, type: c.type.toLowerCase(), lastTest: (c.meta as any)?.lastTest ?? null }));
  return { datasets: out, connections: conns };
}

export async function overview(projectIdOrSlug: string, user: AuthUser) {
  const p = await assertProjectAccess(projectIdOrSlug, user);
  const t = await traffic(p.id, user, 24);
  const y = await prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS n FROM executions e JOIN api_operations o ON o.id = e."operationId" JOIN api_specs s ON s.id = o."specId" WHERE s."projectId" = $1 AND e."createdAt" BETWEEN $2 AND $3`, p.id, since(48), since(24));
  const dh = await dataHealth(p.id, user);
  const alerts = await prisma.alertEvent.findMany({ where: { status: 'FIRING', rule: { projectId: p.id } }, include: { rule: true }, orderBy: { startedAt: 'desc' } });
  const bulk = await prisma.bulkRun.count({ where: { projectId: p.id, status: { in: ['RUNNING', 'QUEUED'] } } });
  const calls = t.operations.reduce((a: number, o: any) => a + o.calls, 0);
  return {
    callsToday: calls, callsYesterday: y[0]?.n ?? 0,
    slowOrFailing: t.operations.filter((o: any) => o.calls && ((o.errors / o.calls) > 0.05 || (o.p95 ?? 0) > 3000)),
    staleData: dh.datasets.filter(d => d.stale || (d.ageHours ?? 0) > 36),
    connectionsDown: dh.connections.filter(c => c.lastTest && !c.lastTest.ok),
    alerts: alerts.map(a => ({ id: a.id, rule: a.rule.name, message: a.message, startedAt: a.startedAt.toISOString() })),
    bulkRunning: bulk,
  };
}

// ---------------------------------------------------------------- alerts
export const DEFAULT_ALERTS = [
  { name: 'อัตราผิดพลาดของ API เกิน 5%', metric: 'error_rate', threshold: 0.05, windowMin: 5 },
  { name: 'เวลาตอบ p95 เกิน 3 วินาที', metric: 'p95_ms', threshold: 3000, windowMin: 5 },
  { name: 'ข้อมูลเก่ากว่า 36 ชั่วโมง หรือดึงข้อมูลล้ม', metric: 'dataset_age_h', threshold: 36, windowMin: 60 },
  { name: 'Connection ต่อไม่ได้', metric: 'connection_down', threshold: 1, windowMin: 5 },
  { name: 'API key จะหมดอายุใน 14 วัน', metric: 'key_expiring', threshold: 14, windowMin: 1440 },
  { name: 'ชุดทดสอบตอนกลางคืนไม่ผ่าน', metric: 'nightly_tests_failed', threshold: 1, windowMin: 1440 },
];

async function measure(rule: any): Promise<{ value: number; message: string }> {
  const p = rule.projectId; const w = new Date(Date.now() - rule.windowMin * 60_000);
  if (rule.metric === 'error_rate' || rule.metric === 'p95_ms') {
    const r = await prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS n, count(*) FILTER (WHERE e.status <> 'SUCCESS')::int AS err, percentile_cont(0.95) WITHIN GROUP (ORDER BY e.duration) AS p95
      FROM executions e JOIN api_operations o ON o.id = e."operationId" JOIN api_specs s ON s.id = o."specId" WHERE s."projectId" = $1 AND e."createdAt" >= $2`, p, w);
    const x = r[0]; if (!x.n) return { value: 0, message: 'ไม่มีการเรียก' };
    return rule.metric === 'error_rate' ? { value: x.err / x.n, message: `ผิดพลาด ${x.err} จาก ${x.n} ครั้ง` } : { value: Number(x.p95), message: `p95 ${Math.round(Number(x.p95))} ms` };
  }
  if (rule.metric === 'dataset_age_h') {
    const sets = await prisma.dataset.findMany({ where: { projectId: p, activeSnapshotId: { not: null } } });
    let worst = 0, name = '';
    for (const d of sets) {
      const s = await prisma.datasetSnapshot.findUnique({ where: { id: d.activeSnapshotId! } });
      const last = await prisma.datasetSnapshot.findFirst({ where: { datasetId: d.id }, orderBy: { createdAt: 'desc' } });
      const age = s ? (Date.now() - s.createdAt.getTime()) / 36e5 : 0;
      const v = last?.status === 'REJECTED' ? Math.max(age, rule.threshold + 1) : age;
      if (v > worst) { worst = v; name = d.slug; }
    }
    return { value: worst, message: `${name} อายุ ${Math.round(worst)} ชม.` };
  }
  if (rule.metric === 'connection_down') {
    const down = (await prisma.connection.findMany({ where: { projectId: p } })).filter(c => (c.meta as any)?.lastTest && !(c.meta as any).lastTest.ok);
    return { value: down.length, message: down.map(c => c.slug).join(', ') || 'ต่อได้ทั้งหมด' };
  }
  if (rule.metric === 'key_expiring') {
    const proj = await prisma.project.findUnique({ where: { id: p } });
    const ks = await prisma.apiKey.findMany({ where: { workspaceId: proj!.workspaceId, active: true, expiresAt: { not: null, lte: new Date(Date.now() + rule.threshold * 86400_000) } } });
    return { value: ks.length ? rule.threshold : 0, message: ks.map(k => `${k.name} หมด ${k.expiresAt!.toISOString().slice(0, 10)}`).join(', ') || 'ไม่มี' };
  }
  if (rule.metric === 'nightly_tests_failed') {
    const r = await prisma.testRun.findFirst({ where: { testSuite: { projectId: p } }, orderBy: { createdAt: 'desc' } });
    return { value: r?.status === 'FAILED' ? 1 : 0, message: r ? `ล่าสุด ${r.passed}/${r.totalRows} ผ่าน` : 'ยังไม่เคยรัน' };
  }
  return { value: 0, message: 'unknown metric' };
}

registerHandler('alerts.evaluate', async () => {
  for (const rule of await prisma.alertRule.findMany({ where: { enabled: true } })) {
    const m = await measure(rule);
    const firing = await prisma.alertEvent.findFirst({ where: { ruleId: rule.id, status: 'FIRING' } });
    const breach = m.value >= rule.threshold && m.value > 0;
    if (breach && !firing) {
      await prisma.alertEvent.create({ data: { ruleId: rule.id, value: m.value, message: m.message } });
      for (const ch of (rule.channels as any[]) || []) if (ch.kind === 'webhook' && ch.url) await outbox('webhook', ch.url, { event: 'alert.firing', alert: rule.name, message: m.message, value: m.value });
    } else if (!breach && firing) {
      await prisma.alertEvent.update({ where: { id: firing.id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
      for (const ch of (rule.channels as any[]) || []) if (ch.kind === 'webhook' && ch.url) await outbox('webhook', ch.url, { event: 'alert.resolved', alert: rule.name });
    }
  }
});
export async function scheduleAlerts(now = new Date()) {
  await enqueue('alerts.evaluate', {}, { dedupeKey: `alerts:${now.toISOString().slice(0, 16)}` });
}
export async function ensureDefaultAlerts(projectId: string) {
  if (await prisma.alertRule.count({ where: { projectId } })) return;
  await prisma.alertRule.createMany({ data: DEFAULT_ALERTS.map(a => ({ ...a, projectId })) });
}

// ---------------------------------------------------------------- Prometheus text
export async function metricsText() {
  const lines: string[] = [];
  const q = await prisma.queueJob.groupBy({ by: ['queue', 'status'], _count: true });
  lines.push('# TYPE xrules_queue_jobs gauge');
  for (const r of q) lines.push(`xrules_queue_jobs{queue="${r.queue}",status="${r.status}"} ${r._count}`);
  const e = await prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE("targetType",'rule') AS t, status, count(*)::int AS n, COALESCE(avg(duration),0) AS avg FROM executions WHERE "createdAt" >= now() - interval '5 minutes' GROUP BY 1, 2`);
  lines.push('# TYPE xrules_executions_5m gauge');
  for (const r of e) lines.push(`xrules_executions_5m{target="${r.t}",status="${r.status}"} ${r.n}`);
  const a = await prisma.alertEvent.count({ where: { status: 'FIRING' } });
  lines.push('# TYPE xrules_alerts_firing gauge', `xrules_alerts_firing ${a}`);
  return lines.join('\n') + '\n';
}
