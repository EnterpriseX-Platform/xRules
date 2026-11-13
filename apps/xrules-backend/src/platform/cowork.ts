// Rule Cowork: turn Thai text / documents into DRAFT vocabulary terms, rule sentences and test
// cases. Nothing is published; the user applies the drafts, then tests and review take over.
import { prisma } from '../config/database.js';
import { ForbiddenError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from '../services/_access.js';
import type { AuthUser } from '../middleware/auth.js';
import { parse, terms as loadTerms, verbalize, saveRule, upsertTerm, type Term } from './vocabulary.js';
import { createCase } from './testing.js';
import { audit } from '../services/governance.service.js';

const MODEL = process.env.XRULES_COWORK_MODEL || 'claude-sonnet-5-5';

const GRAMMAR = `ไวยากรณ์ประโยคกฎ (ต้องตรงทุกตัวอักษร):
ถ้า <เงื่อนไข> (และ|หรือ <เงื่อนไข>)* แล้ว (เตือน|ไม่ผ่าน) "<ข้อความ>" ระดับ (ERROR|WARNING) รหัส <รหัสข้อ>
<เงื่อนไข> = <คำ> <ตัวเทียบ> <ค่า หรือ คำ> | <คำ> ว่าง | <คำ> ไม่ว่าง
ตัวเทียบ: เป็น, ไม่เป็น, มากกว่า, น้อยกว่า, ไม่เกิน, ไม่น้อยกว่า, อยู่ใน, ไม่อยู่ใน
ค่าข้อความใส่ "…" ค่าตัวเลขไม่ต้องใส่ · ใช้ได้เฉพาะคำในรายการคำศัพท์ ถ้าต้องใช้คำใหม่ให้เสนอใน newTerms`;

async function llm(system: string, user: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new ForbiddenError('ยังไม่ได้ตั้ง ANTHROPIC_API_KEY ให้ Rule Cowork');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(120_000),
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error(`AI ตอบผิดพลาด HTTP ${r.status}`);
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
  if (!data.text?.trim()) throw new ValidationError('ใส่ข้อความหรือเอกสารก่อน');
  const vocab = await loadTerms(p.id);
  const system = `คุณช่วยคนธุรกิจของสำนักงบประมาณเขียนกฎตรวจสอบเป็นภาษาไทยที่มีโครงสร้าง
${GRAMMAR}
ถ้าเงื่อนไขกำกวม (เช่น "ซ้ำ" นับจากอะไร) ให้ใส่คำถามใน questions และไม่เดา
ตอบเป็น JSON อย่างเดียว: {"questions":[],"newTerms":[{"term","path","type","values"}],"rules":[{"name","sentence","source"}],"tests":[{"name","input","expectations":[{"kind":"has_finding|no_finding|equals","code","severity","path","value"}]}]}
- source คือข้อความต้นฉบับที่กฎนั้นมาจาก (ยกมาสั้น ๆ)
- path ของข้อมูลรายการให้ขึ้นต้นด้วย item. ข้อมูลระดับคำขอใช้ context.
- input ของ tests อยู่ในรูป {"context":{…},"items":[{…}]}`;
  const userMsg = `คำศัพท์ที่มี:\n${vocab.map(t => `- ${t.term} = ${t.path} (${t.type}${t.values.length ? `: ${t.values.join(', ')}` : ''})`).join('\n') || '(ยังไม่มี)'}\n\nข้อความ / เอกสาร:\n${data.text.slice(0, 60_000)}`;
  const raw = await llm(system, userMsg);
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('AI ไม่ได้ตอบเป็น JSON');
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
    try { const rule = await saveRule({ projectId: p.id, name: r.name, sentence: r.sentence, description: r.source ? `ที่มา: ${r.source}` : undefined }, user); out.rules.push(rule.slug); }
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
