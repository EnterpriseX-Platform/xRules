// Business-language rules (Thai). A small, strict grammar so every sentence maps to exactly one
// executable rule and every rule can be read back as the same sentence.
//
//   ถ้า <เงื่อนไข> (และ|หรือ <เงื่อนไข>)* แล้ว (เตือน|ไม่ผ่าน) "<ข้อความ>" [ระดับ ERROR|WARNING] [รหัส <code>]
//   <เงื่อนไข> = <คำ> <ตัวเทียบ> <ค่า|คำ>  |  <คำ> (ว่าง|ไม่ว่าง)
//   ตัวเทียบ: เป็น ไม่เป็น มากกว่า น้อยกว่า ไม่เกิน ไม่น้อยกว่า อยู่ใน ไม่อยู่ใน
//
// Terms come from the project's Vocabulary. A term whose path starts with "item." makes the rule
// run once per line in input.items and report lineId.
import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from '../services/_access.js';
import type { AuthUser } from '../middleware/auth.js';

export interface Term { term: string; path: string; type: string; values: string[] }
type Operand = { kind: 'term'; term: string; path: string } | { kind: 'value'; value: any } | { kind: 'list'; values: any[] };
export interface Cond { left: { term: string; path: string }; op: string; right?: Operand }
export interface Ast { conds: Cond[]; joins: ('และ' | 'หรือ')[]; action: { kind: 'warn' | 'fail'; message: string; severity: 'ERROR' | 'WARNING'; code?: string }; perItem: boolean }
export interface ParseError { at: number; message: string; suggestions?: string[] }

const OPS: Record<string, string> = { 'ไม่น้อยกว่า': '>=', 'ไม่อยู่ใน': 'nin', 'ไม่เป็น': '!=', 'ไม่เกิน': '<=', 'ไม่ว่าง': 'notempty', 'มากกว่า': '>', 'น้อยกว่า': '<', 'อยู่ใน': 'in', 'เป็น': '==', 'ว่าง': 'empty' };
const OP_WORDS = Object.keys(OPS).sort((a, b) => b.length - a.length);
const OP_TEXT: Record<string, string> = Object.fromEntries(Object.entries(OPS).map(([k, v]) => [v, k]));

export function parse(sentence: string, terms: Term[]): { ast?: Ast; errors: ParseError[] } {
  const errors: ParseError[] = [];
  const src = sentence.replace(/\s+/g, ' ').trim();
  const m = src.match(/^ถ้า\s+(.+?)\s+แล้ว\s+(.+)$/);
  if (!m) return { errors: [{ at: 0, message: 'ประโยคต้องขึ้นต้นด้วย "ถ้า" และมี "แล้ว"', suggestions: ['ถ้า … แล้ว เตือน "…"'] }] };
  const condText = m[1]; const actText = m[2];
  const byLen = [...terms].sort((a, b) => b.term.length - a.term.length);
  const parts = condText.split(/\s+(และ|หรือ)\s+/);
  const conds: Cond[] = []; const joins: any[] = [];
  let at = src.indexOf(condText);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) { joins.push(parts[i]); at += parts[i].length + 2; continue; }
    const p = parts[i].trim();
    const left = byLen.find(t => p.startsWith(t.term) && (p.length === t.term.length || p[t.term.length] === ' '));
    if (!left) { errors.push({ at, message: `ไม่รู้จักคำ "${p.split(' ')[0]}"`, suggestions: closest(p.split(' ')[0], terms) }); at += p.length + 1; continue; }
    const rest = p.slice(left.term.length).trim();
    const opWord = OP_WORDS.find(w => rest.startsWith(w));
    if (!opWord) { errors.push({ at: at + left.term.length, message: `หลัง "${left.term}" ต้องเป็นตัวเทียบ`, suggestions: OP_WORDS }); at += p.length + 1; continue; }
    const op = OPS[opWord]; const rhs = rest.slice(opWord.length).trim();
    let right: Operand | undefined;
    if (op === 'empty' || op === 'notempty') { if (rhs) errors.push({ at, message: `"${opWord}" ไม่ต้องมีค่าต่อท้าย` }); }
    else if (!rhs) errors.push({ at, message: `"${opWord}" ต้องมีค่าต่อท้าย` });
    else if (op === 'in' || op === 'nin') right = { kind: 'list', values: rhs.split(/\s*,\s*|\s+หรือ\s+/).map(lit) };
    else { const t = byLen.find(t => rhs === t.term); right = t ? { kind: 'term', term: t.term, path: t.path } : { kind: 'value', value: lit(rhs) }; }
    if (left.type === 'enum' && right?.kind === 'value' && left.values.length && !left.values.includes(String(right.value))) errors.push({ at, message: `"${right.value}" ไม่ใช่ค่าของ ${left.term}`, suggestions: left.values });
    conds.push({ left: { term: left.term, path: left.path }, op, right });
    at += p.length + 1;
  }
  const am = actText.match(/^(เตือน|ไม่ผ่าน)\s+"([^"]+)"(?:\s+ระดับ\s+(ERROR|WARNING))?(?:\s+รหัส\s+(\S+))?\s*$/);
  if (!am) errors.push({ at: src.indexOf(actText), message: 'หลัง "แล้ว" ต้องเป็น เตือน "ข้อความ" หรือ ไม่ผ่าน "ข้อความ" ตามด้วย ระดับ และ รหัส ถ้ามี', suggestions: ['แล้ว เตือน "…" ระดับ WARNING รหัส TOR-…', 'แล้ว ไม่ผ่าน "…" ระดับ ERROR รหัส TOR-…'] });
  if (errors.length || !am) return { errors };
  const perItem = conds.some(c => c.left.path.startsWith('item.') || (c.right?.kind === 'term' && c.right.path.startsWith('item.')));
  return { ast: { conds, joins, perItem, action: { kind: am[1] === 'เตือน' ? 'warn' : 'fail', message: am[2], severity: (am[3] as any) || (am[1] === 'เตือน' ? 'WARNING' : 'ERROR'), code: am[4] } }, errors: [] };
}

function lit(s: string): any {
  const t = s.trim().replace(/^"(.*)"$/, '$1');
  if (/^-?[\d,]+(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ''));
  if (t === 'จริง') return true; if (t === 'เท็จ') return false;
  return t;
}
function closest(word: string, terms: Term[]) {
  const d = (a: string, b: string) => { const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) m[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return m[a.length][b.length]; };
  return terms.map(t => ({ t: t.term, s: d(word, t.term) })).sort((a, b) => a.s - b.s).slice(0, 3).map(x => x.t);
}

/** Read the AST back as the canonical Thai sentence. */
export function verbalize(ast: Ast): string {
  const val = (o?: Operand) => !o ? '' : o.kind === 'term' ? o.term : o.kind === 'list' ? o.values.map(v => typeof v === 'string' ? `"${v}"` : v).join(', ') : typeof o.value === 'string' ? `"${o.value}"` : Number(o.value).toLocaleString('en-US');
  const conds = ast.conds.map((c, i) => `${i ? ` ${ast.joins[i - 1]} ` : ''}${c.left.term} ${OP_TEXT[c.op]}${c.right ? ' ' + val(c.right) : ''}`).join('');
  return `ถ้า ${conds} แล้ว ${ast.action.kind === 'warn' ? 'เตือน' : 'ไม่ผ่าน'} "${ast.action.message}" ระดับ ${ast.action.severity}${ast.action.code ? ` รหัส ${ast.action.code}` : ''}`;
}

/** Compile to the source of a SCRIPT rule that returns { findings }. Paths: item.* per line, other paths from input. */
export function compile(ast: Ast): string {
  const ref = (path: string) => path.startsWith('item.') ? `get(item, ${JSON.stringify(path.slice(5))})` : `get(input, ${JSON.stringify(path)})`;
  const opnd = (o?: Operand) => !o ? 'undefined' : o.kind === 'term' ? ref(o.path) : JSON.stringify(o.kind === 'list' ? o.values : o.value);
  const c = (x: Cond) => {
    const l = ref(x.left.path), r = opnd(x.right);
    switch (x.op) {
      case '==': return `(${l} == ${r})`; case '!=': return `(${l} != ${r})`;
      case '>': return `(Number(${l}) > Number(${r}))`; case '<': return `(Number(${l}) < Number(${r}))`;
      case '>=': return `(Number(${l}) >= Number(${r}))`; case '<=': return `(Number(${l}) <= Number(${r}))`;
      case 'in': return `(${r}.includes(${l}))`; case 'nin': return `(!${r}.includes(${l}))`;
      case 'empty': return `(${l} === undefined || ${l} === null || ${l} === '')`;
      case 'notempty': return `!(${l} === undefined || ${l} === null || ${l} === '')`;
    }
    return 'false';
  };
  const expr = ast.conds.map((x, i) => (i ? (ast.joins[i - 1] === 'และ' ? ' && ' : ' || ') : '') + c(x)).join('');
  const f = JSON.stringify({ ruleCode: ast.action.code, severity: ast.action.severity, message: ast.action.message });
  return [
    `// generated from a Vocabulary sentence — edit the sentence, not this code`,
    `const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);`,
    `const findings = [];`,
    ast.perItem
      ? `for (const item of (input.items || [])) { if (${expr}) findings.push({ ...${f}, lineId: item.lineId }); }`
      : `const item = undefined; if (${expr}) findings.push(${f});`,
    `return { findings, passed: !findings.some(x => x.severity === 'ERROR') };`,
  ].join('\n');
}

// ---------------------------------------------------------------- persistence
export async function terms(projectId: string): Promise<Term[]> {
  return (await prisma.vocabularyTerm.findMany({ where: { projectId } })).map(t => ({ term: t.term, path: t.path, type: t.type, values: t.values }));
}
export async function listTerms(projectIdOrSlug: string, user: AuthUser) {
  const p = await assertProjectAccess(projectIdOrSlug, user);
  return prisma.vocabularyTerm.findMany({ where: { projectId: p.id }, orderBy: { term: 'asc' } });
}
export async function upsertTerm(data: { projectId: string; term: string; path: string; type?: string; values?: string[]; description?: string }, user: AuthUser) {
  const p = await assertProjectAccess(data.projectId, user, 'write');
  if (!data.term?.trim() || !data.path?.trim()) throw new ValidationError('term and path required');
  if (/[\s]/.test(data.path)) throw new ValidationError('path must not contain spaces');
  return prisma.vocabularyTerm.upsert({ where: { projectId_term: { projectId: p.id, term: data.term.trim() } },
    create: { projectId: p.id, term: data.term.trim(), path: data.path.trim(), type: data.type || 'text', values: data.values || [], description: data.description },
    update: { path: data.path.trim(), type: data.type || 'text', values: data.values || [], description: data.description } });
}
export async function deleteTerm(id: string, user: AuthUser) {
  const t = await prisma.vocabularyTerm.findUnique({ where: { id } }); if (!t) throw new NotFoundError('Term');
  await assertProjectAccess(t.projectId, user, 'write'); await prisma.vocabularyTerm.delete({ where: { id } });
}
/** Suggest paths that have no term yet, from the inputs of test cases and recent executions. */
export async function suggest(projectIdOrSlug: string, user: AuthUser) {
  const p = await assertProjectAccess(projectIdOrSlug, user);
  const known = new Set((await terms(p.id)).map(t => t.path));
  const samples = [
    ...(await prisma.testCase.findMany({ where: { projectId: p.id }, take: 50, select: { input: true } })).map(x => x.input),
    ...(await prisma.execution.findMany({ where: { flow: { projectId: p.id } }, take: 50, orderBy: { createdAt: 'desc' }, select: { input: true } })).map(x => x.input),
  ];
  const paths = new Map<string, any>();
  const walk = (o: any, pre: string) => {
    if (Array.isArray(o)) { if (pre === 'items' && o[0]) walk(o[0], 'item'); return; }
    if (o && typeof o === 'object') { for (const [k, v] of Object.entries(o)) walk(v, pre ? `${pre}.${k}` : k); return; }
    if (pre && !paths.has(pre)) paths.set(pre, o);
  };
  for (const s of samples) walk((s as any)?.body ?? s, '');
  return [...paths.entries()].filter(([path]) => !known.has(path)).map(([path, example]) => ({ path, example, type: typeof example === 'number' ? 'number' : 'text' }));
}

export async function check(projectIdOrSlug: string, sentence: string, user: AuthUser) {
  const p = await assertProjectAccess(projectIdOrSlug, user);
  const r = parse(sentence, await terms(p.id));
  return r.ast ? { ok: true, ast: r.ast, canonical: verbalize(r.ast), source: compile(r.ast), errors: [] } : { ok: false, errors: r.errors };
}

/** Save a sentence as a (draft) SCRIPT rule. Re-saving the same name updates the draft. */
export async function saveRule(data: { projectId: string; name: string; sentence: string; description?: string }, user: AuthUser) {
  const p = await assertProjectAccess(data.projectId, user, 'write');
  const r = parse(data.sentence, await terms(p.id));
  if (!r.ast) throw new ValidationError(r.errors.map(e => e.message).join(' · '));
  const definition = { language: 'th-sentence', sentence: verbalize(r.ast), ast: r.ast, source: compile(r.ast) };
  const slug = data.name.toLowerCase().replace(/[^a-z0-9ก-๙]+/g, '-').replace(/^-|-$/g, '') || `rule-${Date.now()}`;
  const existing = await prisma.rule.findFirst({ where: { projectId: p.id, slug } });
  if (existing) return prisma.rule.update({ where: { id: existing.id }, data: { definition: definition as any, description: data.description, status: 'DRAFT' } });
  return prisma.rule.create({ data: { projectId: p.id, name: data.name, slug, type: 'SCRIPT', definition: definition as any, description: data.description, createdById: user.userId } as any });
}
