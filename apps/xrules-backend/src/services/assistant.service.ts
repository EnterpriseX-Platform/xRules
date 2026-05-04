// AI Assistant — chat endpoint that knows about the user's project context.
// Calls Anthropic by default (or OpenAI), with a system prompt that includes
// the project's rules / flows / models so the assistant can answer "what
// rule does X" or "generate a decision table for Y".
import axios from 'axios';
import { prisma } from '../config/database.js';
import { ForbiddenError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from './_access.js';
import type { AuthUser } from '../middleware/auth.js';

interface ChatMessage { role: 'user' | 'assistant' | 'system'; content: string }

const SYSTEM_PROMPT_TEMPLATE = `You are the XRules Assistant — an expert on decision management, business rules, and the XRules platform itself.

You help users:
1. Design decision logic (decision tables, trees, scorecards, AI agents).
2. Author rule definitions in XRules' JSON format.
3. Diagnose problems with rule executions.
4. Explain XRules concepts (rules, flows, test suites, releases, environments).

Key XRules rule types:
- DECISION_TABLE: { columns: [{name, type, kind}], rules: [{inputs:[{op,value}], outputs:[{value}]}], hitPolicy: 'FIRST'|'UNIQUE'|'ALL' }
- DECISION_TREE: { root: { condition, then: TreeNode, else: TreeNode } } (recursive nodes with leaf 'output')
- SCORECARD: { attributes: [{name, bands:[{match:{eq?,lt?,...}, points}]}], thresholds:[{score, decision}] }
- FORMULA / SCRIPT: { source: '...JavaScript expression returning value...' }
- LOOKUP: { primaryKey, columns:[{name,type}], rows:[{...}] }
- AI_AGENT: { model, prompt, annotations:[{field, type, description}], explainable }

When asked to author a rule, return a SINGLE JSON definition that can be pasted into the Definition tab. Use the project's existing input/output schemas if they exist.

Project context:
{{PROJECT_CONTEXT}}

Be concise. When you produce JSON, wrap it in a fenced \`\`\`json block.`;

export async function chat(
  projectId: string,
  messages: ChatMessage[],
  user: AuthUser,
  opts: { provider?: 'anthropic' | 'openai'; model?: string } = {},
) {
  if (!projectId) throw new ValidationError('projectId required');
  await assertProjectAccess(projectId, user);
  if (!Array.isArray(messages) || messages.length === 0) throw new ValidationError('messages required');

  const provider = opts.provider || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai');
  const apiKey = provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ForbiddenError(`No API key configured. Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'}.`);
  }

  const ctx = await buildProjectContext(projectId);
  const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace('{{PROJECT_CONTEXT}}', ctx);

  if (provider === 'anthropic') {
    return chatAnthropic(apiKey, opts.model || 'claude-haiku-4-5', systemPrompt, messages, projectId, user);
  }
  return chatOpenAI(apiKey, opts.model || 'gpt-4o-mini', systemPrompt, messages);
}

async function buildProjectContext(projectId: string): Promise<string> {
  const [project, rules, flows] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { name: true, slug: true } }),
    prisma.rule.findMany({
      where: { projectId },
      select: { name: true, slug: true, alias: true, type: true, status: true, version: true, inputSchema: true, outputSchema: true },
      take: 200,
    }),
    prisma.flow.findMany({
      where: { projectId },
      select: { name: true, slug: true, kind: true },
      take: 50,
    }),
  ]);
  if (!project) return '(project not found)';

  const lines: string[] = [`Project: ${project.name} (${project.slug})`];
  if (rules.length > 0) {
    lines.push(`\nRules (${rules.length}):`);
    for (const r of rules.slice(0, 50)) {
      const sch = r.inputSchema ? ' [has schemas]' : '';
      lines.push(`  - ${r.name} (${r.slug}) [${r.type}, v${r.version}, ${r.status}]${sch}`);
    }
    if (rules.length > 50) lines.push(`  ... and ${rules.length - 50} more`);
  }
  if (flows.length > 0) {
    lines.push(`\nFlows (${flows.length}):`);
    for (const f of flows.slice(0, 20)) {
      lines.push(`  - ${f.name} (${f.slug}) [${f.kind}]`);
    }
  }
  return lines.join('\n');
}

// Tools the assistant can call on the user's behalf.
const ANTHROPIC_TOOLS = [
  {
    name: 'list_rules',
    description: 'List all rules in the current project. Returns name, slug, type, status, version.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_rule',
    description: 'Fetch a single rule by slug or id, including its definition and schemas. Use when the user asks "what does rule X do" or before generating a similar rule.',
    input_schema: {
      type: 'object',
      required: ['slug'],
      properties: { slug: { type: 'string', description: 'Rule slug or id' } },
    },
  },
  {
    name: 'execute_rule',
    description: 'Execute a rule with the given input and return the output. Use when the user asks "run X with these inputs" or to demo a rule.',
    input_schema: {
      type: 'object',
      required: ['slug', 'input'],
      properties: {
        slug: { type: 'string', description: 'Rule slug or id' },
        input: { type: 'object', description: 'Input JSON matching the rule input schema' },
      },
    },
  },
] as const;

async function runTool(name: string, args: any, projectId: string, user: AuthUser): Promise<any> {
  switch (name) {
    case 'list_rules': {
      const rules = await prisma.rule.findMany({
        where: { projectId },
        select: { id: true, name: true, slug: true, alias: true, type: true, status: true, version: true },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      });
      return rules.map(r => ({ ...r, type: r.type.toLowerCase(), status: r.status.toLowerCase() }));
    }
    case 'get_rule': {
      const ref = String(args?.slug || '');
      const looksLikeId = /^[a-z0-9]{20,30}$/i.test(ref);
      const rule = looksLikeId
        ? await prisma.rule.findUnique({ where: { id: ref } })
        : await prisma.rule.findFirst({ where: { OR: [{ slug: ref }, { alias: ref }], projectId } });
      if (!rule) return { error: `Rule '${ref}' not found in project` };
      return {
        id: rule.id, name: rule.name, slug: rule.slug, alias: rule.alias,
        type: rule.type.toLowerCase(), status: rule.status.toLowerCase(), version: rule.version,
        description: rule.description,
        inputSchema: rule.inputSchema, outputSchema: rule.outputSchema,
        definition: rule.definition,
      };
    }
    case 'execute_rule': {
      const ref = String(args?.slug || '');
      const { executeRule } = await import('./execute.service.js');
      try {
        const result = await executeRule(ref, args?.input || {}, {}, user);
        return { success: true, output: (result as any).output, duration_ms: (result as any).duration };
      } catch (e: any) {
        return { success: false, error: String(e?.message || e) };
      }
    }
  }
  return { error: `Unknown tool: ${name}` };
}

async function chatAnthropic(apiKey: string, model: string, system: string, messages: ChatMessage[], projectId?: string, user?: AuthUser) {
  // Anthropic format: messages with alternating user/assistant; system separate.
  let workingMessages: any[] = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role,
    content: m.content,
  }));

  const enableTools = !!projectId && !!user;
  // Tool-use loop. Anthropic returns tool_use blocks; we run them and feed
  // results back as tool_result content. Loop up to 4 turns to avoid runaway.
  const trace: Array<{ tool: string; input: any; output: any }> = [];
  for (let turn = 0; turn < 4; turn++) {
    const body: any = { model, max_tokens: 2048, system, messages: workingMessages };
    if (enableTools) body.tools = ANTHROPIC_TOOLS;

    const resp = await axios.post(
      'https://api.anthropic.com/v1/messages',
      body,
      {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        timeout: 60_000,
      },
    );
    const content = resp.data?.content || [];
    const stopReason = resp.data?.stop_reason;

    if (stopReason !== 'tool_use') {
      const text = content.find((c: any) => c.type === 'text')?.text || '';
      return { reply: text, provider: 'anthropic', model, trace };
    }

    // Append assistant turn (with tool_use) and run each tool
    workingMessages.push({ role: 'assistant', content });
    const toolResults: any[] = [];
    for (const block of content) {
      if (block.type !== 'tool_use') continue;
      const out = await runTool(block.name, block.input, projectId!, user!);
      trace.push({ tool: block.name, input: block.input, output: out });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(out).slice(0, 8000), // cap size
      });
    }
    workingMessages.push({ role: 'user', content: toolResults });
  }
  return { reply: '(stopped after 4 tool-use turns)', provider: 'anthropic', model, trace };
}

async function chatOpenAI(apiKey: string, model: string, system: string, messages: ChatMessage[]) {
  const resp = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model,
      messages: [
        { role: 'system', content: system },
        ...messages.filter(m => m.role !== 'system'),
      ],
      temperature: 0.4,
    },
    { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 60_000 },
  );
  const text = resp.data?.choices?.[0]?.message?.content || '';
  return { reply: text, provider: 'openai', model };
}
