import axios from 'axios';
import { env } from '../config/env.js';
import { prisma } from '../config/database.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import type { AuthUser } from '../middleware/auth.js';

export async function executeRule(ruleId: string, input: any, context: any, user: AuthUser) {
  if (!ruleId || !input) {
    throw new ValidationError('Rule ID and input are required');
  }

  const rule = await prisma.rule.findUnique({
    where: { id: ruleId },
    include: { project: { include: { workspace: true } } },
  });

  if (!rule) {
    throw new NotFoundError('Rule');
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: rule.project.workspaceId, userId: user.userId },
  });

  if (!membership) {
    throw new ForbiddenError('Access denied');
  }

  const startTime = Date.now();

  try {
    let output: any;

    // Try to call the Engine Hub
    try {
      const engineDefinition = transformDefinitionForEngine(rule);

      const engineResponse = await axios.post(
        `${env.engineHubUrl}/api/v1/execute`,
        {
          rule: {
            type: rule.type,
            engine: rule.engine || 'rules',
            definition: engineDefinition,
          },
          input,
          context: { ...context, rule_id: rule.id, version: rule.version },
        },
        {
          timeout: 30000,
          headers: { 'Content-Type': 'application/json' },
        },
      );

      output = engineResponse.data.output ?? engineResponse.data;
    } catch (engineError: any) {
      // Only fallback to local DMN for connection errors, not for all errors
      const isConnectionError = engineError?.code === 'ECONNREFUSED' || engineError?.code === 'ENOTFOUND' || engineError?.code === 'ETIMEDOUT';
      if (isConnectionError && rule.type === 'DECISION_TABLE') {
        console.log('[Execute] Engine Hub unavailable, using local DMN fallback');
        output = executeDmnLocally(rule, input);
      } else {
        // Re-throw engine errors (validation, execution errors)
        const message = engineError?.response?.data?.message || engineError?.message || 'Engine execution failed';
        throw new Error(message);
      }
    }

    const duration = Date.now() - startTime;

    const execution = await prisma.execution.create({
      data: {
        ruleId: rule.id,
        ruleVersion: rule.version,
        input: input as object,
        output: output as object,
        status: 'SUCCESS',
        duration,
      },
    });

    return {
      id: execution.id,
      ruleId: rule.id,
      version: rule.version,
      input,
      output,
      success: true,
      duration,
      executedAt: execution.createdAt.toISOString(),
    };
  } catch (execError) {
    const duration = Date.now() - startTime;
    const errorMsg = execError instanceof Error ? execError.message : 'Execution failed';

    await prisma.execution.create({
      data: {
        ruleId: rule.id,
        ruleVersion: rule.version,
        input: input as object,
        status: 'FAILED',
        duration,
        error: errorMsg,
      },
    });

    throw execError;
  }
}

/**
 * Transform Prisma-format rule definition to Engine Hub format.
 * Prisma stores: { hitPolicy, inputs: [{id,name,label,type}], outputs, rules }
 * Engine expects: { nodes: [], edges: [], dmn: { hit_policy, inputs: [{name,expression,type}], outputs: [{name,label,type}], rules: [{id,inputs,outputs}] } }
 */
function transformDefinitionForEngine(rule: any): any {
  const def = rule.definition as any;

  if (rule.type === 'DECISION_TABLE' && def?.hitPolicy) {
    return {
      nodes: [],
      edges: [],
      dmn: {
        hit_policy: def.hitPolicy?.toUpperCase() || 'FIRST',
        inputs: (def.inputs || []).map((i: any) => ({
          name: i.name,
          expression: i.name,
          type: i.type || 'string',
        })),
        outputs: (def.outputs || []).map((o: any) => ({
          name: o.name,
          label: o.label || o.name,
          type: o.type || 'string',
        })),
        rules: (def.rules || []).map((r: any) => ({
          id: r.id,
          inputs: r.inputs || [],
          outputs: r.outputs || [],
        })),
      },
    };
  }

  // WORKFLOW type: definition already has nodes/edges format
  // Flatten nested config objects into node data for the engine
  if ((rule.type as string) === 'WORKFLOW' && def?.nodes) {
    return {
      nodes: def.nodes.map((n: any) => {
        const data = { ...(n.data || {}) };
        // Flatten nested config objects into data root for the engine
        if (data.httpConfig) { Object.assign(data, data.httpConfig); delete data.httpConfig; }
        if (data.conditionConfig) { Object.assign(data, data.conditionConfig); delete data.conditionConfig; }
        if (data.transformConfig) { Object.assign(data, data.transformConfig); delete data.transformConfig; }
        if (data.dmnConfig) { Object.assign(data, data.dmnConfig); delete data.dmnConfig; }
        // New node types
        if (data.ruleRefConfig) { Object.assign(data, data.ruleRefConfig); delete data.ruleRefConfig; }
        if (data.mlModelConfig) {
          Object.assign(data, data.mlModelConfig);
          data.endpoint = data.endpoint || process.env.ML_ENGINE_URL || 'http://localhost:50053';
          delete data.mlModelConfig;
        }
        if (data.llmPromptConfig) {
          Object.assign(data, data.llmPromptConfig);
          data.endpoint = data.endpoint || process.env.LLM_ENGINE_URL || 'http://localhost:50054';
          delete data.llmPromptConfig;
        }
        if (data.subflowConfig) { Object.assign(data, data.subflowConfig); delete data.subflowConfig; }
        return {
          id: n.id,
          type: n.type || n.node_type,
          data,
        };
      }),
      edges: (def.edges || []).map((e: any) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      })),
    };
  }

  // For other types, pass definition as-is
  return def;
}

function executeDmnLocally(rule: any, input: any): any {
  if (rule.type !== 'DECISION_TABLE') {
    return { message: 'Execution not implemented for this rule type (Engine Hub unavailable)', input };
  }

  const definition = rule.definition as {
    hitPolicy?: string;
    inputs?: Array<{ name: string; type: string }>;
    outputs?: Array<{ name: string; type: string }>;
    rules?: Array<{ inputs: unknown[]; outputs: unknown[] }>;
  };

  const rules = definition.rules || [];
  const inputKeys = definition.inputs?.map((i) => i.name) || [];
  const outputKeys = definition.outputs?.map((o) => o.name) || [];

  const results: Record<string, unknown>[] = [];

  for (const r of rules) {
    let matches = true;
    for (let i = 0; i < inputKeys.length; i++) {
      const expected = r.inputs[i];
      const actual = input[inputKeys[i]];

      if (expected !== '-' && expected !== '' && expected !== null && expected !== undefined) {
        if (String(expected) !== String(actual)) {
          matches = false;
          break;
        }
      }
    }

    if (matches) {
      const result: Record<string, unknown> = {};
      for (let i = 0; i < outputKeys.length; i++) {
        result[outputKeys[i]] = r.outputs[i];
      }
      results.push(result);

      if (definition.hitPolicy === 'FIRST' || !definition.hitPolicy) {
        break;
      }
    }
  }

  return results.length === 1 ? results[0] : results;
}
