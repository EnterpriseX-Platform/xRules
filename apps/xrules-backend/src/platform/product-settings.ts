// Settings tables: rows are settings (max DSR (bureau hit), min RI, min credit line), columns are products.
// A decision line or a calculation reads "<setting> of this product"; the run fills in the value for the product
// it runs for (the topic's product, or `product` in the API input).
import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from '../services/_access.js';
import type { AuthUser } from '../middleware/auth.js';

export const OF_THIS = ' of this product';
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function productsOf(projectId: string) {
  const topics = await prisma.topic.findMany({ where: { projectId, deletedAt: null, product: { not: null } }, select: { product: true }, orderBy: { createdAt: 'asc' } });
  return Array.from(new Set(topics.map(t => String(t.product)).filter(Boolean)));
}

export async function list(projectIdOrSlug: string, user: AuthUser) {
  const p = await assertProjectAccess(projectIdOrSlug, user);
  const rows = await prisma.productSetting.findMany({ where: { projectId: p.id, deletedAt: null }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
  const products = await productsOf(p.id);
  for (const r of rows) for (const k of Object.keys((r.values as any) || {})) if (!products.includes(k)) products.push(k);
  return { products, rows: rows.map(r => ({ id: r.id, name: r.name, values: r.values || {} })) };
}

const clean = (v: any) => { if (v === null || v === undefined) return null; const s = String(v).trim(); if (!s) return null; const n = Number(s.replace(/,/g, '')); return isNaN(n) ? s : n; };

/** Save the sheet: every row given (new ones without id), the removed ones stamped. */
export async function save(data: { projectId: string; rows: { id?: string; name: string; values: Record<string, any> }[]; removed?: string[] }, user: AuthUser) {
  const p = await assertProjectAccess(data.projectId, user, 'write');
  const names = new Set<string>();
  for (const r of data.rows || []) {
    const n = String(r.name || '').trim(); if (!n) throw new ValidationError('Every setting needs a name');
    if (/[{}"]/.test(n)) throw new ValidationError(`"${n}": a setting name cannot hold braces or quotes`);
    if (names.has(n.toLowerCase())) throw new ValidationError(`"${n}" is in the table twice`); names.add(n.toLowerCase());
  }
  if (data.removed?.length) await prisma.productSetting.updateMany({ where: { projectId: p.id, id: { in: data.removed } }, data: { deletedAt: new Date(), deletedBy: user.userId } });
  const existing = await prisma.productSetting.findMany({ where: { projectId: p.id, deletedAt: null } });
  for (const [i, r] of (data.rows || []).entries()) {
    const values: Record<string, any> = {}; for (const [k, v] of Object.entries(r.values || {})) { const c = clean(v); if (c !== null && k.trim()) values[k.trim()] = c; }
    const hit = (r.id && existing.find(e => e.id === r.id)) || existing.find(e => e.name.toLowerCase() === String(r.name).trim().toLowerCase());
    if (hit) await prisma.productSetting.update({ where: { id: hit.id }, data: { name: String(r.name).trim(), values, position: i } });
    else await prisma.productSetting.create({ data: { projectId: p.id, name: String(r.name).trim(), values, position: i } });
  }
  return list(p.id, user);
}

export async function restore(ids: string[], user: AuthUser) {
  const rows = await prisma.productSetting.findMany({ where: { id: { in: ids || [] } } });
  for (const pid of Array.from(new Set(rows.map(r => r.projectId)))) await assertProjectAccess(pid, user, 'write');
  await prisma.productSetting.updateMany({ where: { id: { in: rows.map(r => r.id) } }, data: { deletedAt: null, deletedBy: null } });
  return { count: rows.length };
}

/** Copy one product's column to a new product (New product from …). */
export async function copyColumn(projectId: string, from: string, to: string) {
  const rows = await prisma.productSetting.findMany({ where: { projectId, deletedAt: null } });
  for (const r of rows) { const v: any = { ...((r.values as any) || {}) }; if (from in v && !(to in v)) { v[to] = v[from]; await prisma.productSetting.update({ where: { id: r.id }, data: { values: v } }); } }
  return rows.length;
}

/** Fill "<setting> of this product" in a definition with the values for one product. */
export function fillSettings(definition: any, rows: { name: string; values: any }[], product: string | null) {
  if (!definition || !rows.length) return definition;
  let s = JSON.stringify(definition);
  if (!s.includes(OF_THIS)) return definition;
  // longest names first, so "min RI" never eats part of "min RI (thin file)"
  for (const r of [...rows].sort((a, b) => b.name.length - a.name.length)) {
    const re = new RegExp(`${esc(r.name)}${esc(OF_THIS)}`, 'gi');
    if (!re.test(s)) continue;
    const v = product ? (r.values as any)?.[product] : undefined;
    if (v === undefined || v === null || v === '') throw new ValidationError(`${r.name} has no value for ${product ? `product ${product}` : 'this run: say which product'}`);
    s = s.replace(re, String(v).replace(/"/g, '\\"'));
  }
  return JSON.parse(s);
}

/** The rule as it runs for a product: settings filled in. Product from the input, else the rule's topic. */
export async function withSettings<T extends { definition: any; projectId: string; topicId?: string | null }>(rule: T, input?: any, product?: string | null): Promise<T> {
  if (!rule?.definition || !JSON.stringify(rule.definition).includes(OF_THIS)) return rule;
  let prod = product ?? (typeof input?.product === 'string' && input.product.trim() ? input.product.trim() : null);
  if (!prod && rule.topicId) prod = (await prisma.topic.findFirst({ where: { id: rule.topicId }, select: { product: true } }))?.product || null;
  const rows = await prisma.productSetting.findMany({ where: { projectId: rule.projectId, deletedAt: null }, select: { name: true, values: true } });
  return { ...rule, definition: fillSettings(rule.definition, rows, prod) };
}

/** "Make it a setting": the number in a line becomes a setting row holding that value for every product. */
export async function makeSetting(data: { ruleId: string; line: number; from: number; to: number; name: string; field?: string; values?: Record<string, number> }, user: AuthUser) {
  const r = await prisma.rule.findUnique({ where: { id: data.ruleId } }); if (!r) throw new NotFoundError('Rule');
  await assertProjectAccess(r.projectId, user, 'write');
  const name = String(data.name || '').trim(); if (!name) throw new ValidationError('Name the setting');
  if (/[{}"]/.test(name)) throw new ValidationError('A setting name cannot hold braces or quotes');
  const def: any = JSON.parse(JSON.stringify(r.definition || {}));
  const lines: any[] = r.type === 'FORMULA' ? def.lines || [] : def.rules || [];
  const line = lines[data.line]; if (!line) throw new ValidationError('That line is not there any more');
  // the text that holds the number: a calculation's formula, or one condition / result cell of a decision line
  const path = data.field || (r.type === 'FORMULA' ? 'expr' : '');
  const get = (o: any, p: string) => p.split('.').reduce((a, k) => a?.[k], o);
  const set = (o: any, p: string, v: any) => { const ks = p.split('.'); const last = ks.pop()!; const t = ks.reduce((a, k) => a[k], o); t[last] = v; };
  const raw = get(line, path); const text = String(raw ?? '');
  const num = text.slice(data.from, data.to);
  const value = Number(num.replace(/,/g, '')); if (!num || isNaN(value)) throw new ValidationError('Pick a number in the line');
  set(line, path, `${text.slice(0, data.from)}${name}${OF_THIS}${text.slice(data.to)}`);
  const products = await productsOf(r.projectId);
  const existing = await prisma.productSetting.findFirst({ where: { projectId: r.projectId, deletedAt: null, name: { equals: name, mode: 'insensitive' } } });
  if (existing) {
    const v: any = { ...((existing.values as any) || {}) }; for (const p of products) if (!(p in v)) v[p] = value; Object.assign(v, data.values || {});
    await prisma.productSetting.update({ where: { id: existing.id }, data: { values: v } });
  } else {
    const n = await prisma.productSetting.count({ where: { projectId: r.projectId, deletedAt: null } });
    await prisma.productSetting.create({ data: { projectId: r.projectId, name, values: { ...Object.fromEntries(products.map(p => [p, value])), ...(data.values || {}) }, position: n } });
  }
  const { updateRule } = await import('../services/rules.service.js');
  await updateRule(r.id, { definition: def } as any, user);
  return { name, value, products };
}

/** The same line in two products, differing in one number: both read the new setting, each product keeps its own value. */
export async function makeSettingPair(data: { name: string; field: string; a: { ruleId: string; product: string; line: number; from: number; to: number; value: number }; b: { ruleId: string; product: string; line: number; from: number; to: number; value: number } }, user: AuthUser) {
  const values = { [data.a.product]: Number(data.a.value), [data.b.product]: Number(data.b.value) };
  await makeSetting({ ruleId: data.a.ruleId, line: data.a.line, from: data.a.from, to: data.a.to, field: data.field, name: data.name, values }, user);
  await makeSetting({ ruleId: data.b.ruleId, line: data.b.line, from: data.b.from, to: data.b.to, field: data.field, name: data.name, values }, user);
  return { name: data.name, values };
}
