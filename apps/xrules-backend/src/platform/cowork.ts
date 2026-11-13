// Rule Cowork: turn text / documents into DRAFT vocabulary terms, rule sentences and test
// cases. Nothing is published; the user applies the drafts, then tests and review take over.
import { prisma } from '../config/database.js';
import { ForbiddenError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from '../services/_access.js';
import type { AuthUser } from '../middleware/auth.js';
import { parse, terms as loadTerms, verbalize, saveRule, upsertTerm, type Term } from './vocabulary.js';
import { createCase } from './testing.js';
import { audit } from '../services/governance.service.js';

const MODEL = process.env.XRULES_COWORK_MODEL || 'claude-sonnet-5-5';

const GRAMMAR = `Rule sentence grammar (must match exactly):
IF <condition> (AND|OR <condition>)* THEN (WARN|FAIL) "<message>" LEVEL (ERROR|WARNING) CODE <clause code>
<condition> = <term> <operator> <value or term> | <term> IS EMPTY | <term> IS NOT EMPTY
operators: IS, IS NOT, GREATER THAN, LESS THAN, AT MOST, AT LEAST, IN, NOT IN
Quote text values with "…"; numbers without quotes. Use only terms from the vocabulary; propose new terms in newTerms.`;

async function llm(system: string, user: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new ForbiddenError('ANTHROPIC_API_KEY is not set for Rule Cowork');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(120_000),
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error(`AI request failed: HTTP ${r.status}`);
  const j: any = await r.json();
  return (j.content || []).map((c: any) => c.text || '').join('');
}

export interface Draft {
  questions: string[];
  newTerms: { term: string; path: string; type: string; values?: string[] }[];
  rules: { name: string; sentence: string; source?: string; ok?: boolean; canonical?: string; errors?: any[] }[];
  tests: { name: string; target?: string; input: any; expectations: any[] }[];
}

/** Ask the AI for drafts, then validate every sentence with the real parser. */
export async function draft(data: { projectId: string; text: string; flow?: string }, user: AuthUser): Promise<Draft> {
  const p = await assertProjectAccess(data.projectId, user, 'write');
  if (!data.text?.trim()) throw new ValidationError('Enter some text or a document first');
  const vocab = await loadTerms(p.id);
  const system = `You help business users of a budget office write validation rules as structured sentences.
${GRAMMAR}
If a condition is ambiguous (for example what "duplicate" is measured against), add a question to questions instead of guessing.
Reply with JSON only: {"questions":[],"newTerms":[{"term","path","type","values"}],"rules":[{"name","sentence","source"}],"tests":[{"name","input","expectations":[{"kind":"has_finding|no_finding|equals","code","severity","path","value"}]}]}
- source is a short quote of the original text the rule comes from
- paths of line-item data start with item.; request-level data uses context.
- test input has the shape {"context":{…},"items":[{…}]}`;
  const userMsg = `Vocabulary:\n${vocab.map(t => `- ${t.term} = ${t.path} (${t.type}${t.values.length ? `: ${t.values.join(', ')}` : ''})`).join('\n') || '(none yet)'}\n\nText / document:\n${data.text.slice(0, 60_000)}`;
  const raw = await llm(system, userMsg);
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('The AI did not reply with JSON');
  const d: Draft = JSON.parse(m[0]);
  d.questions ||= []; d.newTerms ||= []; d.rules ||= []; d.tests ||= [];
  const all: Term[] = [...vocab, ...d.newTerms.map(t => ({ term: t.term, path: t.path, type: t.type || 'text', values: t.values || [] }))];
  for (const r of d.rules) {
    const res = parse(r.sentence, all);
    r.ok = !!res.ast; r.canonical = res.ast ? verbalize(res.ast) : undefined; r.errors = res.errors;
  }
  await audit(p.id, user, 'cowork.draft', 'project', p.id, { rules: d.rules.length, tests: d.tests.length });
  return d;
}

/** Apply drafts the user accepted: terms → rules (draft) → test cases. Never publishes. */
export async function apply(data: { projectId: string; flow?: string; newTerms?: Draft['newTerms']; rules?: Draft['rules']; tests?: Draft['tests'] }, user: AuthUser) {
  const p = await assertProjectAccess(data.projectId, user, 'write');
  const out = { terms: 0, rules: [] as string[], tests: 0, errors: [] as string[] };
  for (const t of data.newTerms || []) { await upsertTerm({ projectId: p.id, ...t }, user); out.terms++; }
  for (const r of data.rules || []) {
    try { const rule = await saveRule({ projectId: p.id, name: r.name, sentence: r.sentence, description: r.source ? `Source: ${r.source}` : undefined }, user); out.rules.push(rule.slug); }
    catch (e: any) { out.errors.push(`${r.name}: ${e.message}`); }
  }
  if (data.flow) {
    const f = await prisma.flow.findFirst({ where: { projectId: p.id, OR: [{ id: data.flow }, { slug: data.flow }] } });
    for (const t of data.tests || []) {
      if (!f) break;
      await createCase({ projectId: p.id, name: t.name, targetType: 'decision_flow', targetId: f.id, input: t.input, expectations: t.expectations }, user); out.tests++;
    }
  }
  await audit(p.id, user, 'cowork.apply', 'project', p.id, out);
  return out;
}
