// Runs published artifacts. Every call uses one fixed version per flow and records an Execution
// with findings, lineage and (sampled) Rule Trace. Used by the API gateway, triggers, bulk runs,
// test cases and challenger runs.
import crypto from 'node:crypto';
import { prisma } from '../config/database.js';
import { runFlow, type TraceStep } from '../services/flow-runtime.service.js';

const SYSTEM_USER = { userId: '__system__', email: 'system@xrules', tenantId: '*', roles: ['OWNER'] } as any;
const TRACE_SAMPLE = Number(process.env.XRULES_TRACE_SAMPLE ?? 0.1);

// ---- artifact cache: published flow graph by flow id → { version, graph }
const artifactCache = new Map<string, { at: number; version: number; graph: any; slug: string; projectId: string; kind: string; id: string }>();
const ARTIFACT_TTL = 30_000;

export function invalidateArtifacts() { artifactCache.clear(); }

export async function loadFlow(projectId: string, slugOrId: string, opts: { version?: number; draft?: boolean } = {}) {
  const ck = `${projectId}|${slugOrId}|${opts.version ?? (opts.draft ? 'draft' : 'live')}`;
  const c = artifactCache.get(ck);
  if (c && Date.now() - c.at < ARTIFACT_TTL) return c;
  const flow = await prisma.flow.findFirst({ where: { projectId, OR: [{ id: slugOrId }, { slug: slugOrId }, { alias: slugOrId }] } });
  if (!flow) throw new Error(`Flow '${slugOrId}' not found`);
  let graph: any = flow.graph; let version = flow.version;
  if (!opts.draft) {
    const v = await prisma.flowVersion.findFirst({ where: { flowId: flow.id, status: 'PUBLISHED', ...(opts.version ? { version: opts.version } : {}) }, orderBy: { version: 'desc' } });
    if (!v) throw new Error(`Flow '${flow.slug}' has no published version`);
    graph = v.graph; version = v.version;
  }
  const art = { at: Date.now(), version, graph, slug: flow.slug, projectId: flow.projectId, kind: flow.kind, id: flow.id };
  artifactCache.set(ck, art);
  return art;
}

async function solveRule(projectId: string, slug: string, payload: any) {
  const { executeRule } = await import('../services/execute.service.js');
  const r = /^[a-z0-9]{20,30}$/i.test(slug)
    ? await prisma.rule.findUnique({ where: { id: slug } })
    : await prisma.rule.findFirst({ where: { projectId, OR: [{ slug }, { alias: slug }] } });
  if (!r) throw new Error(`Rule '${slug}' not found`);
  const result = await executeRule(r.id, payload, {}, SYSTEM_USER);
  return (result as any).output;
}

export interface RunResult { output: any; trace: TraceStep[]; ms: number; version: number; flowId: string; executionId?: string; error?: string }

/** Run a flow (published unless draft) and return output + trace. Nested decision flows are traced as children. */
export async function runArtifact(projectId: string, slugOrId: string, input: any, o: { version?: number; draft?: boolean; subflow?: boolean; record?: { targetType: string; operationId?: string; bulkRunId?: string; requestId?: string; apiKeyId?: string; forceTrace?: boolean; ip?: string; ua?: string } } = {}): Promise<RunResult> {
  const art = await loadFlow(projectId, slugOrId, { version: o.version, draft: o.draft });
  const trace: TraceStep[] = [];
  const t0 = Date.now();
  let output: any; let error: string | undefined;
  try {
    output = await runFlow(art.graph, input, (slug, payload) => solveRule(projectId, slug, payload), {
      projectId, trace,
      callFlow: async (slug, sub) => {
        const r = await runArtifact(projectId, slug, sub, { subflow: !o.draft });
        trace.push({ seq: trace.length + 1, nodeId: `flow:${slug}`, kind: 'subflow', label: slug, status: r.error ? 'error' : 'ok', ms: r.ms, children: r.trace, output: r.output?.summary });
        if (r.error) throw new Error(r.error);
        return r.output;
      },
    });
  } catch (e: any) { error = e?.message || String(e); }
  const ms = Date.now() - t0;
  let executionId: string | undefined;
  if (o.record) {
    const findings = output && Array.isArray(output.findings) ? output.findings : (output?.body && Array.isArray(output.body.findings) ? output.body.findings : null);
    const failed = !!error || (output && (output.passed === false || output.body?.passed === false));
    const keepTrace = o.record.forceTrace || failed || (findings?.length ?? 0) > 0 || trace.some(t => t.status !== 'ok') || Math.random() < TRACE_SAMPLE;
    const ex = await prisma.execution.create({ data: {
      flowId: art.id, flowVersion: art.version, input: input ?? {}, output: output ?? undefined,
      findings: findings ?? undefined, lineage: output?.lineage ?? output?.body?.lineage ?? undefined,
      status: error ? 'FAILED' : 'SUCCESS', error, duration: ms,
      environment: process.env.XRULES_ENV || null,
      targetType: o.record.targetType, operationId: o.record.operationId, bulkRunId: o.record.bulkRunId, requestId: o.record.requestId,
      apiKeyId: o.record.apiKeyId, ipAddress: o.record.ip, userAgent: o.record.ua,
      trace: keepTrace ? (trace as any) : ({ summary: trace.map(t => ({ k: t.kind, s: t.status, ms: t.ms })) } as any),
      traceFull: keepTrace,
    } });
    executionId = ex.id;
  }
  maybeChallenger(projectId, art.id, input, output, executionId, o).catch(() => {});
  return { output, trace, ms, version: art.version, flowId: art.id, executionId, error };
}

// ---------------------------------------------------------------- champion / challenger
const fingerprint = (out: any) => {
  const b = out?.__apiResponse ? out.body : out;
  return JSON.stringify({ passed: b?.passed, codes: (b?.findings || []).map((f: any) => `${f.severity}:${f.ruleCode}`).sort() });
};
async function maybeChallenger(projectId: string, flowId: string, input: any, champion: any, championExecutionId: string | undefined, o: any) {
  if (o.draft || o.record?.targetType === 'challenger' || (!o.record && !o.subflow)) return;
  const f = await prisma.flow.findUnique({ where: { id: flowId }, select: { challenger: true } });
  const c: any = f?.challenger;
  if (!c || (c.until && new Date(c.until) < new Date()) || Math.random() >= Number(c.sampleRate ?? 0.1)) return;
  // runs after the champion already answered; never changes the response
  const r = await runArtifact(projectId, flowId, input, { ...(c.draft ? { draft: true } : { version: c.version }) });
  await prisma.execution.create({ data: {
    flowId, flowVersion: r.version, input: input ?? {}, output: r.output ?? undefined, status: r.error ? 'FAILED' : 'SUCCESS', error: r.error, duration: r.ms,
    targetType: 'challenger', lineage: { championExecutionId, same: !r.error && fingerprint(r.output) === fingerprint(champion), champion: JSON.parse(fingerprint(champion)), challenger: JSON.parse(fingerprint(r.output)) } as any,
  } });
}

export async function challengerSummary(flowId: string) {
  const rows = await prisma.execution.findMany({ where: { flowId, targetType: 'challenger' }, orderBy: { createdAt: 'desc' }, take: 5000, select: { lineage: true, createdAt: true, id: true } });
  const same = rows.filter(r => (r.lineage as any)?.same).length;
  return { total: rows.length, same, different: rows.length - same, examples: rows.filter(r => !(r.lineage as any)?.same).slice(0, 50) };
}

export const newRequestId = () => crypto.randomUUID();
