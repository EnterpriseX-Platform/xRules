// LLM adapter — invoked by the AI Agent rule type.
// Supports OpenAI and Anthropic via env-key fallback or a project Connection.
// The adapter:
//   1. Renders the prompt template against {input.*} / {variables.*} / {attachments.*}
//   2. Calls the chosen provider with a JSON-output instruction
//   3. Parses the JSON response into the rule's outputSchema shape
import axios from 'axios';

interface AIAgentDefinition {
  modelConnectorId?: string;
  model: string;            // e.g. "gpt-4o-mini" / "claude-haiku-4-5-20251001"
  cacheEnabled?: boolean;
  explainable?: boolean;
  prompt: string;
  annotations?: { field: string; type: string; description: string }[];
  attachments?: { filename: string; ref: string }[];
}

interface AICallContext {
  input: any;
  ruleVariables?: any;
  outputSchema?: any;
  apiKey?: string;          // override from project Connection
  provider?: 'openai' | 'anthropic';
}

const cache = new Map<string, any>();   // process-local in-memory cache

export async function callAIAgent(def: AIAgentDefinition, ctx: AICallContext): Promise<any> {
  const provider = pickProvider(def.model, ctx.provider);
  const apiKey   = pickApiKey(provider, ctx.apiKey);
  if (!apiKey) {
    throw new Error(`No API key for ${provider}. Either set ${provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'} env or attach a Connection on the rule.`);
  }

  const renderedPrompt = renderTemplate(def.prompt, ctx.input, ctx.ruleVariables, def.attachments);
  const expectedShape = describeOutputShape(def.annotations, ctx.outputSchema, def.explainable);

  // Cache key is provider+model+prompt — only used if cacheEnabled
  if (def.cacheEnabled) {
    const key = JSON.stringify({ provider, model: def.model, renderedPrompt });
    if (cache.has(key)) return cache.get(key);
  }

  let result: any;
  if (provider === 'anthropic') {
    result = await callAnthropic(apiKey, def.model, renderedPrompt, expectedShape);
  } else {
    result = await callOpenAI(apiKey, def.model, renderedPrompt, expectedShape);
  }

  if (def.cacheEnabled) {
    const key = JSON.stringify({ provider, model: def.model, renderedPrompt });
    cache.set(key, result);
    if (cache.size > 1000) {
      // Naive bound — drop oldest
      const first = cache.keys().next().value;
      if (first) cache.delete(first);
    }
  }
  return result;
}

function pickProvider(model: string, override?: string): 'openai' | 'anthropic' {
  if (override === 'openai' || override === 'anthropic') return override;
  if (/^claude/i.test(model) || /^anthropic/i.test(model)) return 'anthropic';
  return 'openai';
}

function pickApiKey(provider: 'openai' | 'anthropic', override?: string): string | undefined {
  if (override) return override;
  return provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
}

// "{input.foo}" / "{variables.bar}" / "{attachments.policy.pdf}" template renderer.
function renderTemplate(tpl: string, input: any, vars: any, attachments?: { filename: string; ref: string }[]): string {
  return tpl.replace(/\{([\w.]+)\}/g, (_m, path) => {
    const segs = path.split('.');
    let scope: any = null;
    if (segs[0] === 'input') scope = input;
    else if (segs[0] === 'variables') scope = vars;
    else if (segs[0] === 'attachments') scope = attachments?.reduce((a: any, x) => (a[x.filename] = x.ref, a), {}) || {};
    let cur = scope;
    for (let i = 1; i < segs.length && cur != null; i++) cur = cur[segs[i]];
    if (cur === undefined || cur === null) return `<missing:${path}>`;
    return typeof cur === 'string' ? cur : JSON.stringify(cur);
  });
}

function describeOutputShape(annotations?: any[], schema?: any, explainable?: boolean): string {
  const lines: string[] = ['Respond with a SINGLE JSON object matching this shape:'];
  const fields: { name: string; type: string; description: string }[] = [];
  if (annotations?.length) {
    for (const a of annotations) fields.push({ name: a.field, type: a.type || 'auto', description: a.description || '' });
  } else if (schema?.properties) {
    for (const [name, spec] of Object.entries<any>(schema.properties)) {
      fields.push({ name, type: spec.type || 'string', description: spec.description || '' });
    }
  }
  if (explainable) {
    fields.push(
      { name: 'probability',     type: 'number', description: 'model confidence 0..1' },
      { name: 'reason',          type: 'string', description: 'short rationale' },
      { name: 'source_fragments',type: 'array',  description: 'supporting input excerpts' },
      { name: 'warnings',        type: 'array',  description: 'low-confidence flags' },
    );
  }
  for (const f of fields) lines.push(`  "${f.name}": <${f.type}>${f.description ? ' — ' + f.description : ''}`);
  lines.push('No prose, no explanation outside the JSON.');
  return lines.join('\n');
}

async function callOpenAI(apiKey: string, model: string, prompt: string, shape: string): Promise<any> {
  const resp = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model,
      messages: [
        { role: 'system', content: shape },
        { role: 'user',   content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    },
    { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 60_000 },
  );
  const content = resp.data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned no content');
  return JSON.parse(content);
}

async function callAnthropic(apiKey: string, model: string, prompt: string, shape: string): Promise<any> {
  const resp = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: model || 'claude-haiku-4-5',
      max_tokens: 4000,
      system: shape,
      messages: [{ role: 'user', content: prompt }],
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
  const text = resp.data?.content?.[0]?.text;
  if (!text) throw new Error('Anthropic returned no content');
  // Anthropic doesn't have a strict JSON mode — find the first {…} blob.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Anthropic response did not contain JSON');
  return JSON.parse(match[0]);
}
