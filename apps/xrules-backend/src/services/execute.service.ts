import axios from 'axios';
import { env } from '../config/env.js';
import { prisma } from '../config/database.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import { callAIAgent } from './llm.service.js';
import { runScripting, evalExpression, setSolveResolver } from './sandbox.service.js';
import { runFlow } from './flow-runtime.service.js';
import { dispatch as dispatchWebhook } from './webhooks.service.js';
import type { AuthUser } from '../middleware/auth.js';

// Wire DR.solve() in the sandbox so SCRIPT rules can chain into other rules.
// We resolve by id, slug, or alias (project-scoped via the originating rule).
// System user is used because the script runs server-side without a JWT.
const SYSTEM_USER: AuthUser = { userId: '__system__', email: 'system@xrules', tenantId: '*', roles: ['OWNER'] } as any;
let solveResolverWired = false;
function ensureSolveResolver() {
  if (solveResolverWired) return;
  solveResolverWired = true;
  setSolveResolver(async (slugOrId: string, payload: any) => {
    const target = await resolveRuleByAny(slugOrId);
    if (!target) throw new Error(`DR.solve: rule '${slugOrId}' not found`);
    const result = await executeRule(target.id, payload || {}, {}, SYSTEM_USER);
    return (result as any).output;
  });
}
async function resolveRuleByAny(slugOrId: string) {
  const looksLikeId = /^[a-z0-9]{20,30}$/i.test(slugOrId);
  if (looksLikeId) {
    const r = await prisma.rule.findUnique({ where: { id: slugOrId } });
    if (r) return r;
  }
  return prisma.rule.findFirst({ where: { OR: [{ slug: slugOrId }, { alias: slugOrId }] } });
}

// In-process executors for rule kinds that don't go through the Rust engine:
// AI Agent (LLM), Scorecard, Scripting Rule, Lookup Table.
export async function tryLocalExecutor(rule: any, input: any, context: any): Promise<any | null> {
  switch (rule.type) {
    case 'AI_AGENT': return callAIAgent(rule.definition, {
      input, ruleVariables: rule.ruleVariables, outputSchema: rule.outputSchema,
    });
    case 'SCORECARD': return runScorecard(rule.definition, input);
    case 'DECISION_TREE': return rule.definition?.root ? runDecisionTree(rule.definition.root, input) : null;
    case 'SCRIPT':    return runScripting(rule.definition, input, rule.ruleVariables);
    case 'FORMULA':   return runFormula(rule.definition, input, rule.ruleVariables);
    case 'LOOKUP':    return runLookup(rule.definition, input);
    case 'MODEL_CALL': {
      // { model: "<slug>", forEach?: "items", fields?: [...] } — predictions from the model's published version
      const d: any = rule.definition || {};
      if (!d.model) throw new Error('Model Call rule needs definition.model (the model slug)');
      const pick = (o: any) => (Array.isArray(d.fields) && d.fields.length ? Object.fromEntries(d.fields.map((f: string) => [f, o?.[f]])) : o);
      const list = d.forEach ? String(d.forEach).split('.').reduce((o: any, k: string) => o?.[k], input) : null;
      const rows = Array.isArray(list) ? list.map(pick) : [pick(input)];
      const { predict } = await import('../platform/ml.js');
      const r = await predict(rule.projectId, String(d.model), rows);
      return Array.isArray(list) ? { model: r.model, version: r.version, results: r.results } : { model: r.model, version: r.version, ...r.results[0] };
    }
    case 'RULE_FLOW': {
      const graph = (rule.definition && rule.definition.graph) || rule.definition;
      return runFlow(graph, input, async (slug, payload) => {
        const target = await resolveRuleByAny(slug);
        if (!target) throw new Error(`RULE_FLOW: rule '${slug}' not found`);
        const result = await executeRule(target.id, payload || {}, {}, SYSTEM_USER);
        return (result as any).output;
      }, { projectId: rule.projectId });
    }
    default: return null;
  }
}

// Scorecard: { attributes: [{ name, bands: [{ match, points }] }], thresholds: [{ score, decision }] }
function runScorecard(def: any, input: any): any {
  let score = 0;
  for (const attr of (def?.attributes || [])) {
    const v = input[attr.name];
    for (const band of (attr.bands || [])) {
      if (matchBand(v, band.match)) { score += Number(band.points || 0); break; }
    }
  }
  // Thresholds sorted high → low; pick first whose score >= score
  const sorted = [...(def?.thresholds || [])].sort((a, b) => Number(b.score) - Number(a.score));
  let decision: any = null;
  for (const t of sorted) if (score >= Number(t.score)) { decision = t.decision; break; }
  return { score, decision };
}
function matchBand(value: any, m: any): boolean {
  if (!m) return false;
  if ('eq'  in m) return value === m.eq;
  if ('lt'  in m) return Number(value) <  Number(m.lt);
  if ('lte' in m) return Number(value) <= Number(m.lte);
  if ('gt'  in m) return Number(value) >  Number(m.gt);
  if ('gte' in m) return Number(value) >= Number(m.gte);
  if ('btw' in m && Array.isArray(m.btw)) {
    const [lo, hi] = m.btw; return Number(value) >= Number(lo) && Number(value) <= Number(hi);
  }
  if ('in'  in m && Array.isArray(m.in))  return m.in.includes(value);
  return false;
}

// Formula: { source: '<expression>' } — single expression returning a value.
// Distinguished from SCRIPT in that the source is an EXPRESSION (no braces, no return).
function runFormula(def: any, input: any, vars?: any): any {
  const src = def?.source ?? def?.expression;
  if (!src) throw new Error('Formula rule has no source');
  // fields are reachable both as input.x and as bare x
  return evalExpression(String(src), { ...(input || {}), input, ruleVariables: vars || {}, Math, Date, JSON, parseInt, parseFloat, isNaN, isFinite });
}

// Decision Tree as the studio designs it: { root: { type:'if', conditions, orGroups, then, else } | { type:'then', outputs } }.
// A node's conditions are ANDed; each OR group is another ANDed set — the node matches if any set matches.
function runDecisionTree(node: any, input: any): any {
  for (let depth = 0; node && depth < 100; depth++) {
    if (node.type !== 'if') return { ...(node.outputs || {}) };
    const sets = [node.conditions || [], ...(node.orGroups || [])].filter((g: any[]) => g.length);
    const hit = sets.length === 0 || sets.some((g: any[]) => g.every((c: any) => treeCondition(c, input)));
    node = hit ? node.then : node.else;
  }
  return {};
}
function treeCondition(c: any, input: any): boolean {
  const v = String(c.field || '').split('.').reduce((o: any, k: string) => o?.[k], input);
  const num = (x: any) => (x === '' || x == null || isNaN(Number(x)) ? NaN : Number(x));
  const list = (x: any) => (Array.isArray(x) ? x : String(x ?? '').split(',')).map((s: any) => String(s).trim());
  const eq = (a: any, b: any) => (!isNaN(num(a)) && !isNaN(num(b)) ? num(a) === num(b) : String(a ?? '') === String(b ?? ''));
  const lo = num(c.value), hi = num(c.value2), n = num(v);
  switch (String(c.op || '=').toUpperCase()) {
    case 'ANY': case 'ELSE': return true;
    case '=': return eq(v, c.value);
    case '!=': return !eq(v, c.value);
    case 'IN': return list(c.value).some(x => eq(v, x));
    case '!IN': return !list(c.value).some(x => eq(v, x));
    case '>': return n > lo;
    case '>=': return n >= lo;
    case '<': return n < lo;
    case '<=': return n <= lo;
    case 'BTW': return n >= lo && n <= hi;
    case 'BTW LO': return n > lo && n <= hi;
    case 'BTW RO': return n >= lo && n < hi;
    case '!BTW': return !(n >= lo && n <= hi);
    case 'NULL': return v == null || v === '';
    case '!NULL': return !(v == null || v === '');
    case 'C TXT': return String(v ?? '').includes(String(c.value ?? ''));
    case 'C IN': return Array.isArray(v) && v.some(x => eq(x, c.value));
    case '!C IN': return !(Array.isArray(v) && v.some(x => eq(x, c.value)));
    case 'EQ ARR': return Array.isArray(v) && JSON.stringify(v.map(String)) === JSON.stringify(list(c.value));
    default: throw new Error(`Decision Tree: unknown operator '${c.op}'`);
  }
}

// Lookup: { primaryKey, columns, rows: [{...}] } — exact match by primaryKey
function runLookup(def: any, input: any): any {
  const pk = def?.primaryKey;
  if (!pk) return null;
  const key = input[pk];
  const found = (def?.rows || []).find((r: any) => r[pk] === key);
  return found || null;
}

export async function executeRule(ruleId: string, input: any, context: any, user: AuthUser) {
  ensureSolveResolver();
  if (!ruleId || !input) {
    throw new ValidationError('Rule ID and input are required');
  }

  // Accept id, slug, or alias
  const looksLikeId = /^[a-z0-9]{20,30}$/i.test(ruleId);
  let rule = looksLikeId
    ? await prisma.rule.findUnique({
        where: { id: ruleId },
        include: { project: { include: { workspace: true } } },
      })
    : null;
  if (!rule) {
    rule = await prisma.rule.findFirst({
      where: { OR: [{ slug: ruleId }, { alias: ruleId }] },
      include: { project: { include: { workspace: true } } },
    });
  }
  if (!rule) {
    throw new NotFoundError('Rule');
  }

  // System user (used by DR.solve chained calls) skips membership check —
  // the originating call already validated the caller, so we trust the chain.
  if (user.userId !== '__system__') {
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId: rule.project.workspaceId, userId: user.userId },
    });
    if (!membership) {
      throw new ForbiddenError('Access denied');
    }
  }

  const startTime = Date.now();

  try {
    let output: any;

    // 1) In-process executors for non-Rust rule kinds (AI Agent / Scorecard / Script / Lookup)
    const local = rule.type === 'DECISION_TABLE' && String((rule.definition as any)?.hitPolicy).toUpperCase() === 'EVALUATE_ALL'
      ? executeDmnLocally(rule, input)
      : await tryLocalExecutor(rule, input, context);
    if (local !== null) {
      output = local;
    } else
    // 2) Rust engine for everything else (Decision Table / Tree / Flow primitives)
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

      output = shapeByHitPolicy(rule, applyElseRow(rule, engineResponse.data.output ?? engineResponse.data));
    } catch (engineError: any) {
      // Only fallback to local DMN for connection errors, not for all errors
      const isConnectionError = engineError?.code === 'ECONNREFUSED' || engineError?.code === 'ENOTFOUND' || engineError?.code === 'ETIMEDOUT';
      if (isConnectionError && rule.type === 'DECISION_TABLE') {
        console.log('[Execute] Engine Hub unavailable, using local DMN fallback');
        output = applyElseRow(rule, executeDmnLocally(rule, input));
      } else {
        // Re-throw engine errors (validation, execution errors)
        const message = engineError?.response?.data?.message || engineError?.message || 'Engine execution failed';
        // a missing input field is the caller's mistake: say which field, as a 400, not "Internal server error"
        const missing = /Path not found: ([\w.\[\]]+)/.exec(message);
        if (missing) throw new ValidationError(`Input is missing field "${missing[1]}"`);
        if (/Validation error/i.test(message)) throw new ValidationError(message.replace(/^.*Validation error:\s*/i, ''));
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

    // Fire-and-forget webhook dispatch
    dispatchWebhook('execute.success', {
      executionId: execution.id,
      ruleId: rule.id, ruleSlug: rule.slug, ruleVersion: rule.version,
      input, output, duration,
    }, { workspaceId: rule.project.workspaceId, ruleId: rule.id });

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

    const failed = await prisma.execution.create({
      data: {
        ruleId: rule.id,
        ruleVersion: rule.version,
        input: input as object,
        status: 'FAILED',
        duration,
        error: errorMsg,
      },
    });

    dispatchWebhook('execute.error', {
      executionId: failed.id,
      ruleId: rule.id, ruleSlug: rule.slug, ruleVersion: rule.version,
      input, error: errorMsg, duration,
    }, { workspaceId: rule.project.workspaceId, ruleId: rule.id });

    throw execError;
  }
}

/**
 * Transform Prisma-format rule definition to Engine Hub format.
 * Prisma stores: { hitPolicy, inputs: [{id,name,label,type}], outputs, rules }
 * Engine expects: { nodes: [], edges: [], dmn: { hit_policy, inputs: [{name,expression,type}], outputs: [{name,label,type}], rules: [{id,inputs,outputs}] } }
 */
// Studio hit policies → DMN names the Rust engine knows (UNIQUE | FIRST | COLLECT | ANY).
//   STANDARD     all matches in rule order        → COLLECT
//   FIRST_MATCH  first match only                  → FIRST
//   ARRAY        matches folded into column arrays → COLLECT, then reshaped here
//   EVALUATE_ALL every row with a _match flag      → evaluated in the API (no engine policy)
const HIT_POLICY_TO_DMN: Record<string, string> = { STANDARD: 'COLLECT', FIRST_MATCH: 'FIRST', ARRAY: 'COLLECT' };
function engineHitPolicy(p?: string): string {
  const k = String(p || 'FIRST').toUpperCase();
  return HIT_POLICY_TO_DMN[k] ?? k;
}
const isElseCell = (c: any) => typeof c === 'string' && ['else', '_else_'].includes(c.trim().toLowerCase());
function isElseRow(r: any): boolean { return Array.isArray(r?.inputs) && r.inputs.length > 0 && r.inputs.some(isElseCell); }
// Decision Table Else row: its results are the answer when no other row matched.
function applyElseRow(rule: any, out: any): any {
  if (rule.type !== 'DECISION_TABLE') return out;
  const def = rule.definition as any;
  const row = (def?.rules || []).find(isElseRow);
  const empty = out == null || (Array.isArray(out) && out.length === 0) || (typeof out === 'object' && !Array.isArray(out) && Object.keys(out).length === 0);
  if (!row || !empty) return out;
  const names: string[] = (def?.outputs || []).map((o: any) => o.name);
  const value: Record<string, unknown> = {};
  names.forEach((n, i) => { value[n] = row.outputs?.[i] ?? null; });
  return engineHitPolicy(def?.hitPolicy) === 'COLLECT' || Array.isArray(out) ? [value] : value;
}
function shapeByHitPolicy(rule: any, out: any): any {
  const p = String((rule.definition as any)?.hitPolicy || '').toUpperCase();
  if (p !== 'ARRAY') return out;
  const rows: any[] = Array.isArray(out) ? out : out && typeof out === 'object' ? [out] : [];
  const cols: Record<string, unknown[]> = {};
  for (const row of rows) for (const [k, v] of Object.entries(row)) (cols[k] ||= []).push(v);
  return cols;
}

function transformDefinitionForEngine(rule: any): any {
  const def = rule.definition as any;

  if (rule.type === 'DECISION_TABLE') {
    // Engine expects { nodes, edges, dmn: { hit_policy, inputs, outputs, rules } }
    // even when the stored definition is just { rules: [...] } without metadata.
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
        hit_policy: engineHitPolicy(def?.hitPolicy),
        inputs: inputs.map((i: any) => ({
          name: i.name, expression: i.name, type: i.type || 'string',
        })),
        outputs: outputs.map((o: any) => ({
          name: o.name, label: o.label || o.name, type: o.type || 'string',
        })),
        // the Else row is not a condition the engine knows — it is applied after, when nothing matched
        rules: (def?.rules || []).filter((r: any) => !isElseRow(r)).map((r: any) => ({
          id: r.id, inputs: r.inputs || [], outputs: r.outputs || [],
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
  const evaluated: Record<string, unknown>[] = [];

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

      if (['FIRST', 'FIRST_MATCH', 'UNIQUE'].includes(String(definition.hitPolicy || 'FIRST').toUpperCase())) break;
    }
    if (String(definition.hitPolicy).toUpperCase() === 'EVALUATE_ALL') {
      const row: Record<string, unknown> = { _match: matches };
      outputKeys.forEach((k, i) => { row[k] = r.outputs[i]; });
      evaluated.push(row);
    }
  }
  if (String(definition.hitPolicy).toUpperCase() === 'EVALUATE_ALL') return evaluated;
  return shapeByHitPolicy(rule, results.length === 1 && ['FIRST', 'FIRST_MATCH', 'UNIQUE', 'ANY', undefined, ''].includes(String(definition.hitPolicy || '').toUpperCase() || undefined) ? results[0] : results);
}
