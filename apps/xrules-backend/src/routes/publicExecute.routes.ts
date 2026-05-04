import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { apiKeyAuthMiddleware } from '../middleware/apiKeyAuth.js';
import { NotFoundError } from '../utils/errors.js';

const router = Router();

/**
 * Public execute endpoint — authenticates via API key (X-API-Key header).
 * External systems use this to execute rules programmatically.
 *
 * POST /api/v1/rules/:id/execute
 */
router.post('/rules/:id/execute', apiKeyAuthMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ruleId = req.params.id;
    const { input, context } = req.body;

    // Check scope
    if (!req.apiKey!.scopes.includes('execute')) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'API key does not have execute scope' } });
      return;
    }

    // Load rule (must belong to workspace of the API key)
    const rule = await prisma.rule.findUnique({
      where: { id: ruleId },
      include: { project: { include: { workspace: true } } },
    });

    if (!rule) throw new NotFoundError('Rule');
    if (rule.project.workspaceId !== req.apiKey!.workspaceId) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Rule not in API key workspace' } });
      return;
    }

    const startTime = Date.now();

    // Transform definition for engine
    const engineDefinition = transformForEngine(rule);

    // Call Engine Hub
    const engineResponse = await axios.post(
      `${env.engineHubUrl}/api/v1/execute`,
      {
        rule: {
          type: rule.type,
          engine: rule.engine || 'rules',
          definition: engineDefinition,
        },
        input: input || {},
        context: { ...context, rule_id: rule.id, version: rule.version, api_key_id: req.apiKey!.keyId },
      },
      { timeout: 30000, headers: { 'Content-Type': 'application/json' } },
    );

    const duration = Date.now() - startTime;
    const output = engineResponse.data.output ?? engineResponse.data;

    // Record execution
    const execution = await prisma.execution.create({
      data: {
        ruleId: rule.id,
        ruleVersion: rule.version,
        input: (input || {}) as object,
        output: output as object,
        status: 'SUCCESS',
        duration,
        apiKeyId: (req as any).apiKey?.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({
      id: execution.id,
      output,
      duration_ms: duration,
      version: rule.version,
      engine: engineResponse.data.engine_used || rule.engine,
      timestamp: execution.createdAt.toISOString(),
    });
  } catch (err: any) {
    const duration = Date.now();
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
