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
    return chatAnthropic(apiKey, opts.model || 'claude-haiku-4-5', systemPrompt, messages);
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

async function chatAnthropic(apiKey: string, model: string, system: string, messages: ChatMessage[]) {
  // Anthropic format: messages with alternating user/assistant; system separate.
  const filtered = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role,
    content: m.content,
  }));
  const resp = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model,
      max_tokens: 2048,
      system,
      messages: filtered,
    },
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: 60_000,
    },
  );
  const text = resp.data?.content?.[0]?.text || '';
  return { reply: text, provider: 'anthropic', model };
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
