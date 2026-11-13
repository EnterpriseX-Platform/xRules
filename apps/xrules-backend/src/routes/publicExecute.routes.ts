import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { apiKeyAuthMiddleware } from '../middleware/apiKeyAuth.js';
import { NotFoundError } from '../utils/errors.js';
import { parseSolverHeaders } from '../middleware/solverHeaders.js';
import { tryLocalExecutor } from '../services/execute.service.js';
import { runFlow } from '../services/flow-runtime.service.js';
import { dispatch as dispatchWebhook } from '../services/webhooks.service.js';

const router = Router();

// Resolve a flow by id OR slug within a workspace.
async function resolveFlow(idOrSlug: string, workspaceId: string) {
  let flow = await prisma.flow.findUnique({
    where: { id: idOrSlug },
    include: { project: { include: { workspace: true } } },
  });
  if (!flow) {
    const matches = await prisma.flow.findMany({
      where: { slug: idOrSlug, project: { workspaceId } },
      include: { project: { include: { workspace: true } } },
      take: 1,
    });
    flow = matches[0] || null;
  }
  return flow;
}

// Resolve a rule by id OR alias within a project (alias precedence after id miss).
async function resolveRule(idOrAlias: string, workspaceId: string) {
  let rule = await prisma.rule.findUnique({
    where: { id: idOrAlias },
    include: { project: { include: { workspace: true } } },
  });
  if (!rule) {
    // Try alias (project-scoped) — pick first match in workspace.
    const matches = await prisma.rule.findMany({
      where: { alias: idOrAlias, project: { workspaceId } },
      include: { project: { include: { workspace: true } } },
      take: 1,
    });
    rule = matches[0] || null;
  }
  return rule;
}

// Single-row solve (extracted to share with bulk).
async function solveOne(rule: any, input: any, context: any, headers: ReturnType<typeof parseSolverHeaders>, apiKey: any, req: Request) {
  const startTime = Date.now();
  const strategy = headers.strategy || rule.strategy || 'STANDARD';
  const fullContext = {
    ...context,
    rule_id: rule.id, version: rule.version,
    api_key_id: apiKey?.keyId,
    correlation_id: headers.correlationId,
    strategy,
    lookup_method: headers.lookupMethod,
  };

  // 1) In-process executors (AI_AGENT / SCORECARD / SCRIPT / FORMULA / LOOKUP).
  let output: any;
  const local = await tryLocalExecutor(rule, input, fullContext);
  if (local !== null) {
    output = local;
  } else {
    // 2) Rust engine for DECISION_TABLE / DECISION_TREE / etc.
    const engineDefinition = transformForEngine(rule);
    const engineResponse = await axios.post(
      `${env.engineHubUrl}/api/v1/execute`,
      {
        rule: { type: rule.type, engine: rule.engine || 'rules', definition: engineDefinition },
        input: input || {},
        context: fullContext,
      },
      { timeout: 30000 },
    );
    output = engineResponse.data.output ?? engineResponse.data;
  }
  const duration = Date.now() - startTime;

  // Audit gate — skip Execution row if X-Audit=false.
  let executionId: string | undefined;
  if (headers.audit) {
    const exec = await prisma.execution.create({
      data: {
        ruleId: rule.id, ruleVersion: rule.version,
        input: (input || {}) as object, output: output as object,
        status: 'SUCCESS', duration,
        apiKeyId: (apiKey?.id as any) || null,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });
    executionId = exec.id;
  }
  // Webhook dispatch (fire-and-forget)
  dispatchWebhook('execute.success', {
    executionId, ruleId: rule.id, ruleSlug: rule.slug, ruleVersion: rule.version,
    input, output, duration,
  }, { workspaceId: rule.project.workspaceId, ruleId: rule.id });
  return { output, duration_ms: duration, version: rule.version, correlation_id: headers.correlationId };
}

/**
 * Public execute endpoint — authenticates via API key (X-API-Key header).
 * External systems use this to execute rules programmatically.
 *
 * POST /api/v1/rules/:id/execute
 */
// DR-style versioned alias path: POST /api/v1/rules/:idOrAlias/v/:version/execute
router.post('/rules/:idOrAlias/v/:version/execute', apiKeyAuthMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey!.scopes.includes('execute')) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'API key does not have execute scope' } }); return;
    }
    const rule = await resolveRule(req.params.idOrAlias, req.apiKey!.workspaceId);
    if (!rule) throw new NotFoundError('Rule');
    if (rule.project.workspaceId !== req.apiKey!.workspaceId) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Rule not in API key workspace' } }); return;
    }
    // Pin to a specific version by overlaying the RuleVersion snapshot.
    const targetVersion = Number(req.params.version);
    if (Number.isFinite(targetVersion) && targetVersion !== rule.version) {
      const snap = await prisma.ruleVersion.findUnique({
        where: { ruleId_version: { ruleId: rule.id, version: targetVersion } },
      });
      if (!snap) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Version ${targetVersion} not found for rule` } }); return;
      }
      // Overlay the snapshotted definition + schemas onto the rule object
      (rule as any).definition  = snap.definition;
      (rule as any).inputSchema = snap.inputSchema;
      (rule as any).outputSchema= snap.outputSchema;
      (rule as any).version     = snap.version;
    }
    const headers = parseSolverHeaders(req);
    const data = req.body?.data ?? req.body?.input;
    const isBulk = Array.isArray(data);
    if (isBulk) {
      const results = await Promise.all(data.map((row: any) => solveOne(rule, row, req.body?.context, headers, req.apiKey, req)));
      res.json(results);
    } else {
      res.json(await solveOne(rule, data, req.body?.context, headers, req.apiKey, req));
    }
  } catch (err: any) {
    if (err?.response?.data?.message) {
      res.status(err.response.status || 500).json({ success: false, error: { code: 'ENGINE_ERROR', message: err.response.data.message } });
    } else { next(err); }
  }
});

router.post('/rules/:id/execute', apiKeyAuthMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey!.scopes.includes('execute')) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'API key does not have execute scope' } });
      return;
    }
    const rule = await resolveRule(req.params.id, req.apiKey!.workspaceId);
    if (!rule) throw new NotFoundError('Rule');
    if (rule.project.workspaceId !== req.apiKey!.workspaceId) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Rule not in API key workspace' } });
      return;
    }
    const headers = parseSolverHeaders(req);
    // Accept both DR-style { data } and legacy { input } body shapes.
    const data = req.body?.input ?? req.body?.data;
    const isBulk = Array.isArray(data);
    if (isBulk) {
      const results = await Promise.all(data.map((row: any) => solveOne(rule, row, req.body?.context, headers, req.apiKey, req)));
      res.json(results);
    } else {
      res.json(await solveOne(rule, data, req.body?.context, headers, req.apiKey, req));
    }
  } catch (err: any) {
    if (err?.response?.data?.message) {
      res.status(err.response.status || 500).json({
        success: false,
        error: { code: 'ENGINE_ERROR', message: err.response.data.message },
      });
    } else {
      next(err);
    }
  }
});

// Public flow execute — POST /api/v1/flows/:slug/execute
// Runs the flow's graph through flow-runtime and returns the output.
router.post('/flows/:slug/execute', apiKeyAuthMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey!.scopes.includes('execute')) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'API key does not have execute scope' } });
      return;
    }
    const flow = await resolveFlow(req.params.slug, req.apiKey!.workspaceId);
    if (!flow) throw new NotFoundError('Flow');
    if (flow.project.workspaceId !== req.apiKey!.workspaceId) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Flow not in API key workspace' } });
      return;
    }
    if (flow.status !== 'PUBLISHED') {
      res.status(400).json({ success: false, error: { code: 'NOT_PUBLISHED', message: `Flow '${flow.slug}' is ${flow.status.toLowerCase()}; publish to expose as endpoint` } });
      return;
    }
    const startTime = Date.now();
    const input = req.body?.input ?? req.body ?? {};
    const { executeRule } = await import('../services/execute.service.js');
    const SYSTEM_USER = { userId: '__system__', email: 'system@xrules', tenantId: '*', roles: ['OWNER'] } as any;
    const output = await runFlow(flow.graph as any, input, async (slug: string, payload: any) => {
      const r = /^[a-z0-9]{20,30}$/i.test(slug)
        ? await prisma.rule.findUnique({ where: { id: slug } })
        : await prisma.rule.findFirst({ where: { OR: [{ slug }, { alias: slug }], project: { workspaceId: req.apiKey!.workspaceId } } });
      if (!r) throw new Error(`Flow node references unknown rule '${slug}'`);
      const result = await executeRule(r.id, payload, {}, SYSTEM_USER);
      return (result as any).output;
    }, { projectId: flow.projectId });
    const duration = Date.now() - startTime;

    // Decision flows that return findings are always recorded, so every verdict can be traced and replayed.
    let executionId: string | undefined;
    if (output && typeof output === 'object' && Array.isArray((output as any).findings)) {
      const lineage = { flow: `${flow.slug}@${flow.version}`, ...((output as any).lineage || {}) };
      (output as any).lineage = lineage;
      const ex = await prisma.execution.create({
        data: {
          flowId: flow.id, flowVersion: flow.version,
          input: input as object, output: output as object,
          findings: (output as any).findings, lineage,
          status: 'SUCCESS', duration,
          environment: process.env.XRULES_ENV || null,
          apiKeyId: ((req.apiKey as any)?.id) || null, ipAddress: req.ip, userAgent: req.headers['user-agent'],
        },
      });
      executionId = ex.id;
      (output as any).executionId = ex.id;
    }

    // Audit row in Execution table — flow runs are first-class executions.
    const headers = parseSolverHeaders(req);
    if (headers.audit) {
      // Pick any rule the flow called as the audit anchor (best-effort)
      const anchor = (flow.graph as any)?.nodes?.find((n: any) => (n.type || n.data?.kind) === 'ruleCall');
      const anchorSlug = anchor?.data?.ruleSlug;
      const anchorRule = anchorSlug
        ? await prisma.rule.findFirst({ where: { OR: [{ slug: anchorSlug }, { alias: anchorSlug }], projectId: flow.projectId } })
        : null;
      if (anchorRule) {
        await prisma.execution.create({
          data: {
            ruleId: anchorRule.id,
            ruleVersion: anchorRule.version,
            input: input as object,
            output: output as object,
            status: 'SUCCESS',
            duration,
            apiKeyId: ((req.apiKey as any)?.id) || null,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
          },
        });
      }
    }

    dispatchWebhook('flow.success', {
      flowId: flow.id, flowSlug: flow.slug, flowVersion: flow.version,
      input, output, duration,
    }, { workspaceId: flow.project.workspaceId });

    res.json({ output, duration_ms: duration, flow: flow.slug, version: flow.version, execution_id: executionId });
  } catch (err: any) {
    if (err?.response?.data?.message) {
      res.status(err.response.status || 500).json({ success: false, error: { code: 'FLOW_ERROR', message: err.response.data.message } });
    } else {
      next(err);
    }
  }
});

function transformForEngine(rule: any): any {
  const def = rule.definition as any;

  if (rule.type === 'DECISION_TABLE') {
    const inputSchemaProps = (rule.inputSchema as any)?.properties || {};
    const outputSchemaProps = (rule.outputSchema as any)?.properties || {};
    const inputs = (def?.inputs?.length ? def.inputs : Object.keys(inputSchemaProps).map((name) => ({
      name, type: inputSchemaProps[name]?.type || 'string',
    })));
    const outputs = (def?.outputs?.length ? def.outputs : Object.keys(outputSchemaProps).map((name) => ({
      name, type: outputSchemaProps[name]?.type || 'string',
    })));
    return {
      nodes: [],
      edges: [],
      dmn: {
        hit_policy: (def?.hitPolicy || 'FIRST').toUpperCase(),
        inputs: inputs.map((i: any) => ({ name: i.name, expression: i.name, type: i.type || 'string' })),
        outputs: outputs.map((o: any) => ({ name: o.name, label: o.label || o.name, type: o.type || 'string' })),
        rules: (def?.rules || []).map((r: any) => ({ id: r.id, inputs: r.inputs || [], outputs: r.outputs || [] })),
      },
    };
  }

  if ((rule.type as string) === 'WORKFLOW' && def?.nodes) {
    return {
      nodes: def.nodes.map((n: any) => {
        const data = { ...(n.data || {}) };
        for (const key of ['httpConfig', 'conditionConfig', 'transformConfig', 'dmnConfig', 'ruleRefConfig', 'mlModelConfig', 'llmPromptConfig', 'subflowConfig']) {
          if (data[key]) { Object.assign(data, data[key]); delete data[key]; }
        }
        return { id: n.id, type: n.type || n.node_type, data };
      }),
      edges: (def.edges || []).map((e: any) => ({ id: e.id, source: e.source, target: e.target })),
    };
  }

  return def;
}

export default router;
