// The project library: decisions and calculations several products share.
// A topic step references a library item in one of three ways:
//  - Use: the library's lines as they are;
//  - Extend: only the difference is kept (lines switched off, lines added or changed here), library changes flow through;
//  - Own: a copy that remembers where it came from ("copied from X v3").
// A reference follows the latest approved version, or stays on a fixed one until someone takes the new version.
// The reference's own definition is the worked-out result, so runs, maps and editors read it like any rule.
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from '../services/_access.js';
import { generateSlug } from '../utils/slug.js';
import type { AuthUser } from '../middleware/auth.js';

export type Mode = 'use' | 'extend' | 'own';
export type Diff = { off?: string[]; added?: { after: string | null; line: any; replaces?: string }[]; props?: Record<string, any> };
export type Ref = { itemId: string; mode: Mode; pin: 'latest' | number; version?: number; diff?: Diff; origins?: string[]; copiedFrom?: { id: string; name: string; version: number } };

const SHARABLE = new Set(['DECISION_TABLE', 'FORMULA']);
const linesKey = (type: string) => (String(type).toUpperCase() === 'FORMULA' ? 'lines' : 'rules');
const linesOf = (type: string, def: any): any[] => (Array.isArray(def?.[linesKey(type)]) ? def[linesKey(type)] : []);
const bare = (l: any) => { if (!l || typeof l !== 'object') return l; const { id, ...rest } = l; return rest; };
const same = (a: any, b: any) => JSON.stringify(bare(a)) === JSON.stringify(bare(b));
const hash = (x: any) => createHash('sha1').update(JSON.stringify(bare(x))).digest('hex').slice(0, 12);

/** A stable name for each line: a calculation line by its word, a decision line by its id or its content. */
export function keysOf(type: string, lines: any[]): string[] {
  const seen = new Map<string, number>();
  return lines.map(l => {
    const k = String(type).toUpperCase() === 'FORMULA' ? `n:${l?.name ?? ''}` : l?.id ? `i:${l.id}` : `h:${hash(l)}`;
    const n = seen.get(k) || 0; seen.set(k, n + 1);
    return n ? `${k}#${n}` : k;
  });
}

/** Library lines + the difference = the lines this product runs, each with where it came from. */
export function materialize(type: string, base: { definition: any; version: number }, diff: Diff | undefined, product: string) {
  const blines = linesOf(type, base.definition); const keys = keysOf(type, blines);
  const off = new Set(diff?.off || []); const added = diff?.added || [];
  const lines: any[] = []; const origins: string[] = [];
  const here = (a: { replaces?: string }) => `${product || 'This product'} ${a.replaces ? 'changed' : 'added'}`;
  const emit = (after: string | null) => added.filter(a => (a.after ?? null) === after).forEach(a => { lines.push(a.line); origins.push(here(a)); });
  emit(null);
  blines.forEach((l, i) => { if (!off.has(keys[i])) { lines.push(l); origins.push(`Library v${base.version}`); } emit(keys[i]); });
  // lines added after a library line that is not there any more go at the end
  const placed = new Set([null, ...keys]);
  added.filter(a => !placed.has(a.after ?? null)).forEach(a => { lines.push(a.line); origins.push(here(a)); });
  const props = Object.fromEntries(Object.entries(diff?.props || {}).filter(([k]) => k !== 'inputs' && k !== 'outputs'));
  return { definition: { ...(base.definition || {}), ...props, [linesKey(type)]: lines }, origins };
}

/** What a product changed against the library: lines switched off, lines added (after which library line), other settings. */
export function deriveDiff(type: string, baseDef: any, localDef: any): Diff {
  const b = linesOf(type, baseDef), l = linesOf(type, localDef);
  const bk = keysOf(type, b), lk = keysOf(type, l);
  const matched = new Set<string>(); const isMatch: boolean[] = [];
  l.forEach((line, i) => { const j = bk.indexOf(lk[i]); const ok = j >= 0 && !matched.has(bk[j]) && same(b[j], line); if (ok) matched.add(bk[j]); isMatch.push(ok); });
  const off = bk.filter(k => !matched.has(k));
  const added: NonNullable<Diff['added']> = []; let after: string | null = null;
  l.forEach((line, i) => {
    if (isMatch[i]) { after = lk[i]; return; }
    // the library line this one stands in for: same word (calculation), or the switched-off line in its place
    const sameName = bk.includes(lk[i]) && off.includes(lk[i]) ? lk[i] : undefined;
    const next = bk[(after === null ? -1 : bk.indexOf(after)) + 1];
    const replaces = sameName || (next && off.includes(next) && !added.some(a => a.replaces === next) ? next : undefined);
    added.push({ after, line, ...(replaces && { replaces }) });
  });
  const props: Record<string, any> = {};
  for (const k of Object.keys(localDef || {})) if (k !== linesKey(type) && k !== 'inputs' && k !== 'outputs' && JSON.stringify(localDef[k]) !== JSON.stringify(baseDef?.[k])) props[k] = localDef[k];
  return { off, added, ...(Object.keys(props).length && { props }) };
}
const emptyDiff = (d?: Diff) => !d || (!(d.off || []).length && !(d.added || []).length && !Object.keys(d.props || {}).length);

/** The library item's definition at a version: latest approved, or a fixed one (a draft item with no approval yet runs its draft). */
export async function baseOf(item: { id: string; definition: any; version: number }, pin: 'latest' | number) {
  const v = pin === 'latest'
    ? await prisma.ruleVersion.findFirst({ where: { ruleId: item.id, status: 'PUBLISHED' as any }, orderBy: { version: 'desc' } })
    : await prisma.ruleVersion.findFirst({ where: { ruleId: item.id, version: Number(pin) } });
  return v ? { definition: v.definition as any, version: v.version } : { definition: item.definition as any, version: item.version };
}
async function latestApproved(itemId: string) {
  return (await prisma.ruleVersion.findFirst({ where: { ruleId: itemId, status: 'PUBLISHED' as any }, orderBy: { version: 'desc' }, select: { version: true } }))?.version ?? null;
}
const refOf = (r: any): Ref | null => (r?.libraryRef && typeof r.libraryRef === 'object' && r.libraryRef.itemId ? (r.libraryRef as Ref) : null);
async function productOf(r: { topicId: string | null }) {
  const t = r.topicId ? await prisma.topic.findFirst({ where: { id: r.topicId }, select: { product: true, name: true } }) : null;
  return t?.product || t?.name || '';
}

/** Work a reference out again from its library item (after the item is approved, the pin moves or the difference changes). */
export async function refresh(ruleId: string) {
  const r = await prisma.rule.findUnique({ where: { id: ruleId } }); const ref = refOf(r);
  if (!r || !ref || ref.mode === 'own') return r;
  const item = await prisma.rule.findUnique({ where: { id: ref.itemId } }); if (!item) return r;
  const base = await baseOf(item, ref.pin);
  const m = materialize(r.type, base, ref.mode === 'extend' ? ref.diff : undefined, await productOf(r));
  return prisma.rule.update({ where: { id: r.id }, data: { definition: m.definition, libraryRef: { ...ref, version: base.version, origins: m.origins } as any } });
}

/** Every reference that follows the latest approved version takes the item's new version. */
export async function refreshUsers(itemId: string) {
  const refs = await usersOf(itemId);
  for (const r of refs) if (refOf(r)!.mode !== 'own' && refOf(r)!.pin === 'latest') await refresh(r.id);
  return refs.length;
}
async function usersOf(itemId: string) {
  return prisma.rule.findMany({ where: { libraryRef: { path: ['itemId'], equals: itemId } } });
}

/** A product edited its referenced decision in the editor: keep only the difference (Use becomes Extend). */
export async function onLocalEdit(ruleId: string) {
  const r = await prisma.rule.findUnique({ where: { id: ruleId } }); const ref = refOf(r);
  if (!r || !ref || ref.mode === 'own') return;
  const item = await prisma.rule.findUnique({ where: { id: ref.itemId } }); if (!item) return;
  const base = await baseOf(item, ref.pin);
  const diff = deriveDiff(r.type, base.definition, r.definition);
  const mode: Mode = emptyDiff(diff) ? 'use' : 'extend';
  await prisma.rule.update({ where: { id: r.id }, data: { libraryRef: { ...ref, mode, diff } as any } });
  await refresh(r.id);
}

async function newSlug(projectId: string, name: string) {
  const base = generateSlug(name); let slug = base; let n = 1;
  while (await prisma.rule.findFirst({ where: { projectId, OR: [{ slug }, { alias: slug }] } })) slug = `${base}-${++n}`;
  return slug;
}

/** Put a copy of a decision into the library as its first approved version (it is live already where it came from). */
async function newItem(src: any, user: AuthUser) {
  const slug = await newSlug(src.projectId, `${src.name} library`);
  const item = await prisma.rule.create({ data: { projectId: src.projectId, name: src.name, slug, alias: slug, type: src.type, definition: src.definition || {}, ruleVariables: src.ruleVariables ?? undefined,
    description: src.description, library: true, status: 'PUBLISHED', version: 1, createdById: user.userId } });
  await prisma.ruleVersion.create({ data: { ruleId: item.id, version: 1, definition: item.definition as any, status: 'PUBLISHED', message: `Moved to library from ${src.name}`, createdById: user.userId } });
  return item;
}
/** Point a rule at an item; what it holds beyond the item is kept as its difference. */
async function attach(ruleId: string, itemId: string) {
  const r = await prisma.rule.findUnique({ where: { id: ruleId } }); if (!r) return;
  await prisma.rule.update({ where: { id: ruleId }, data: { libraryRef: { itemId, mode: 'use', pin: 'latest' } as any } });
  await onLocalEdit(ruleId);
}

/** Move to library: the first decision becomes the item; each one given switches to Use (or Extend when it differs). */
export async function moveToLibrary(data: { ruleIds: string[] }, user: AuthUser) {
  const rules = await prisma.rule.findMany({ where: { id: { in: data.ruleIds || [] } } });
  const ordered = (data.ruleIds || []).map(id => rules.find(r => r.id === id)).filter(Boolean) as any[];
  if (!ordered.length) throw new NotFoundError('Decision');
  for (const pid of Array.from(new Set(ordered.map(r => r.projectId)))) await assertProjectAccess(pid, user, 'write');
  const first = ordered[0];
  if (!SHARABLE.has(String(first.type))) throw new ValidationError('Only decisions and calculations go in the library');
  if (ordered.some(r => r.type !== first.type || r.projectId !== first.projectId)) throw new ValidationError('Move decisions of one kind from one project');
  if (ordered.some(r => r.library || (refOf(r) && refOf(r)!.mode !== 'own'))) throw new ValidationError('One of these is in the library already');
  const item = await newItem(first, user);
  for (const r of ordered) await attach(r.id, item.id);
  return { itemId: item.id, name: item.name, users: ordered.length };
}

/** A step takes a library item: Use, Extend or Own. */
export async function reference(data: { topicId: string; stageId?: string; itemId: string; mode?: Mode; pin?: 'latest' | number }, user: AuthUser) {
  const t = await prisma.topic.findFirst({ where: { id: data.topicId, deletedAt: null } }); if (!t) throw new NotFoundError('Topic');
  await assertProjectAccess(t.projectId, user, 'write');
  const item = await prisma.rule.findFirst({ where: { id: data.itemId, library: true, projectId: t.projectId } }); if (!item) throw new NotFoundError('Library item');
  const mode: Mode = data.mode === 'own' || data.mode === 'extend' ? data.mode : 'use';
  const pin = data.pin && data.pin !== 'latest' ? Number(data.pin) : 'latest';
  const base = await baseOf(item, pin);
  const slug = await newSlug(t.projectId, `${item.name} ${t.product || t.name}`);
  const ref: Ref = mode === 'own' ? { itemId: item.id, mode, pin, copiedFrom: { id: item.id, name: item.name, version: base.version } } : { itemId: item.id, mode, pin };
  const r = await prisma.rule.create({ data: { projectId: t.projectId, topicId: t.id, name: item.name, slug, alias: slug, type: item.type, definition: base.definition || {}, ruleVariables: item.ruleVariables ?? undefined,
    status: mode === 'own' ? 'DRAFT' : 'PUBLISHED', createdById: user.userId, libraryRef: ref as any } });
  await refresh(r.id);
  if (data.stageId && Array.isArray(t.stages)) {
    const stages = (t.stages as any[]).map(s => (s?.id === data.stageId ? { ...s, items: [...(s.items || []), r.id] } : s));
    await prisma.topic.update({ where: { id: t.id }, data: { stages } });
  }
  return { id: r.id };
}

/** Change how a step uses its library item, or which version it follows. */
export async function setRef(ruleId: string, data: { mode?: Mode; pin?: 'latest' | number }, user: AuthUser) {
  const r = await prisma.rule.findUnique({ where: { id: ruleId } }); const ref = refOf(r);
  if (!r || !ref) throw new NotFoundError('Library reference');
  await assertProjectAccess(r.projectId, user, 'write');
  const item = await prisma.rule.findUnique({ where: { id: ref.itemId } }); if (!item) throw new NotFoundError('Library item');
  const next: Ref = { ...ref };
  if (data.pin !== undefined) next.pin = data.pin === 'latest' ? 'latest' : Number(data.pin);
  if (data.mode === 'own') { const base = await baseOf(item, ref.pin); Object.assign(next, { mode: 'own', copiedFrom: { id: item.id, name: item.name, version: ref.version ?? base.version } }); delete next.diff; delete next.origins; }
  else if (data.mode === 'use') { next.mode = 'use'; next.diff = {}; delete next.copiedFrom; }
  else if (data.mode === 'extend') {
    // from Own: what the copy holds beyond the library becomes the difference
    if (ref.mode === 'own') next.diff = deriveDiff(r.type, (await baseOf(item, next.pin)).definition, r.definition);
    next.mode = 'extend'; delete next.copiedFrom;
  }
  await prisma.rule.update({ where: { id: r.id }, data: { libraryRef: next as any } });
  await refresh(r.id);
  return info(r.id, user);
}

/** Switch one library line off (or on again) for this product. */
export async function toggleLine(ruleId: string, data: { key: string; off: boolean }, user: AuthUser) {
  const r = await prisma.rule.findUnique({ where: { id: ruleId } }); const ref = refOf(r);
  if (!r || !ref || ref.mode === 'own') throw new NotFoundError('Library reference');
  await assertProjectAccess(r.projectId, user, 'write');
  const off = new Set(ref.diff?.off || []); if (data.off) off.add(data.key); else off.delete(data.key);
  const diff: Diff = { ...(ref.diff || {}), off: Array.from(off) };
  await prisma.rule.update({ where: { id: r.id }, data: { libraryRef: { ...ref, diff, mode: emptyDiff(diff) ? 'use' : 'extend' } as any } });
  await refresh(r.id);
  return info(r.id, user);
}

/** A reference as the panel shows it: every line with where it came from, the library lines switched off, and for Own how far the copy is from the library. */
export async function info(ruleId: string, user: AuthUser) {
  const r = await prisma.rule.findUnique({ where: { id: ruleId } }); const ref = refOf(r);
  if (!r) throw new NotFoundError('Rule');
  await assertProjectAccess(r.projectId, user);
  if (r.library) {
    const users = await usersOf(r.id); const latest = await latestApproved(r.id);
    return { kind: 'item', id: r.id, name: r.name, latest, draft: r.status !== 'PUBLISHED', users: await describeUsers(users, latest) };
  }
  if (!ref) return { kind: 'none' };
  const item = await prisma.rule.findUnique({ where: { id: ref.itemId } });
  if (!item) return { kind: 'missing', mode: ref.mode };
  const latest = await latestApproved(item.id);
  const versions = await prisma.ruleVersion.findMany({ where: { ruleId: item.id, status: 'PUBLISHED' as any }, orderBy: { version: 'desc' }, select: { version: true, createdAt: true, message: true } });
  const lines = linesOf(r.type, r.definition); const keys = keysOf(r.type, lines);
  const out: any = { kind: 'ref', itemId: item.id, item: item.name, mode: ref.mode, pin: ref.pin, version: ref.version ?? null, latest, versions, type: r.type, columns: { inputs: (r.definition as any)?.inputs || [], outputs: (r.definition as any)?.outputs || [] } };
  if (ref.mode === 'own') {
    const base = await baseOf(item, 'latest'); const d = deriveDiff(r.type, base.definition, r.definition);
    const bl = linesOf(r.type, base.definition); const bk = keysOf(r.type, bl);
    out.copiedFrom = ref.copiedFrom; out.differ = (d.off || []).length + (d.added || []).filter(a => !a.replaces).length;
    out.compare = { libraryVersion: base.version, onlyLibrary: (d.off || []).map(k => bl[bk.indexOf(k)]), onlyHere: (d.added || []).map(a => a.line) };
    out.lines = lines.map((l, i) => ({ key: keys[i], line: l, from: 'Own' }));
    return out;
  }
  const origins = ref.origins || [];
  out.lines = lines.map((l, i) => ({ key: keys[i], line: l, from: origins[i] || '', local: !/^Library/.test(origins[i] || '') }));
  const base = await baseOf(item, ref.pin); const bl = linesOf(r.type, base.definition); const bk = keysOf(r.type, bl);
  out.off = (ref.diff?.off || []).map(k => ({ key: k, line: bl[bk.indexOf(k)] })).filter(x => x.line);
  return out;
}
async function describeUsers(users: any[], latest: number | null) {
  const topics = await prisma.topic.findMany({ where: { id: { in: users.map(u => u.topicId).filter(Boolean) as string[] } }, select: { id: true, name: true, product: true } });
  return users.map(u => { const ref = refOf(u)!; const t = topics.find(x => x.id === u.topicId);
    const d = ref.diff || {}; return { ruleId: u.id, topicId: u.topicId, topic: t?.name || '', product: t?.product || '', mode: ref.mode, pin: ref.pin, version: ref.version ?? null, behind: ref.pin !== 'latest' && latest != null && Number(ref.pin) < latest,
      changes: ref.mode === 'extend' ? { off: (d.off || []).length, added: (d.added || []).length } : null }; });
}

/** The project's library: each item with its version and the products that use it. */
export async function list(projectIdOrSlug: string, user: AuthUser) {
  const p = await assertProjectAccess(projectIdOrSlug, user);
  const items = await prisma.rule.findMany({ where: { projectId: p.id, library: true }, orderBy: { name: 'asc' } });
  const refs = await prisma.rule.findMany({ where: { projectId: p.id, libraryRef: { not: Prisma.AnyNull } } });
  const out = [];
  for (const it of items) {
    const latest = await latestApproved(it.id);
    const users = refs.filter(r => refOf(r)?.itemId === it.id);
    out.push({ id: it.id, name: it.name, type: it.type, version: it.version, latest, status: String(it.status).toLowerCase(), reviewState: it.reviewState, lines: linesOf(it.type, it.definition).length, updatedAt: it.updatedAt, users: await describeUsers(users, latest) });
  }
  return out;
}

// ---- Approval ripple: what a library change does to each product that uses it
export async function ripple(itemId: string, user: AuthUser) {
  const item = await prisma.rule.findFirst({ where: { id: itemId, library: true } }); if (!item) throw new NotFoundError('Library item');
  const p = await assertProjectAccess(item.projectId, user);
  const latest = await latestApproved(item.id);
  const live = await baseOf(item, 'latest');
  const draft = { definition: item.definition as any, version: item.version };
  const changed = JSON.stringify(live.definition) !== JSON.stringify(draft.definition);
  const users = await usersOf(item.id);
  const topics = await prisma.topic.findMany({ where: { id: { in: users.map(u => u.topicId).filter(Boolean) as string[] } } });
  const { dryRunTopic } = await import('./testing.js');
  const products: any[] = [];
  for (const u of users) {
    const ref = refOf(u)!; const t = topics.find(x => x.id === u.topicId);
    const row: any = { ruleId: u.id, topicId: u.topicId, topic: t?.name || '', product: t?.product || t?.name || '', mode: ref.mode, pin: ref.pin };
    if (ref.mode === 'own') { row.affected = false; row.why = `Own copy of v${ref.copiedFrom?.version ?? '?'}: not changed`; products.push(row); continue; }
    if (ref.pin !== 'latest') { row.affected = false; row.why = `Stays on v${ref.pin} until someone takes the new version`; products.push(row); continue; }
    row.affected = true;
    const next = materialize(u.type, draft, ref.mode === 'extend' ? ref.diff : undefined, row.product).definition;
    if (t) {
      const before = await dryRunTopic(t.id, {}); const after = await dryRunTopic(t.id, { [u.id]: next });
      row.tests = { total: after.length, passBefore: before.filter(c => c.pass).length, pass: after.filter(c => c.pass).length };
      row.cases = after.map((c, i) => ({ name: c.name, pass: c.pass, wasPass: before[i]?.pass ?? null, changed: JSON.stringify(c.result) !== JSON.stringify(before[i]?.result), result: c.result, was: before[i]?.result, checks: c.checks }))
        .filter(c => c.changed || c.pass !== c.wasPass);
    }
    row.lines = { before: linesOf(u.type, u.definition).length, after: linesOf(u.type, next).length };
    products.push(row);
  }
  const using = new Set(products.map(x => x.product));
  const all = await (await import('./product-settings.js')).productsOf(p.id);
  return { id: item.id, name: item.name, latest, draftVersion: item.version, changed, status: String(item.status).toLowerCase(), reviewState: item.reviewState,
    lines: { live: linesOf(item.type, live.definition).length, draft: linesOf(item.type, draft.definition).length },
    products, notChanged: all.filter(x => !using.has(x)) };
}

/** Take the newer version for a step pinned to an older one; the product's tests run first and must pass (unless forced). */
export async function takeNew(ruleId: string, data: { force?: boolean }, user: AuthUser) {
  const r = await prisma.rule.findUnique({ where: { id: ruleId } }); const ref = refOf(r);
  if (!r || !ref || ref.mode === 'own') throw new NotFoundError('Library reference');
  await assertProjectAccess(r.projectId, user, 'write');
  const item = await prisma.rule.findUnique({ where: { id: ref.itemId } }); if (!item) throw new NotFoundError('Library item');
  const latest = await latestApproved(item.id); if (latest == null) throw new ValidationError('The library item has no approved version');
  const base = await baseOf(item, latest);
  const next = materialize(r.type, base, ref.mode === 'extend' ? ref.diff : undefined, await productOf(r)).definition;
  const { dryRunTopic } = await import('./testing.js');
  const cases = r.topicId ? await dryRunTopic(r.topicId, { [r.id]: next }) : [];
  const failed = cases.filter(c => !c.pass);
  if (failed.length && !data.force) return { taken: false, version: latest, total: cases.length, failed: failed.map(c => ({ name: c.name, checks: c.checks })) };
  await prisma.rule.update({ where: { id: r.id }, data: { libraryRef: { ...ref, pin: latest } as any } });
  await refresh(r.id);
  if (r.topicId) await (await import('./testing.js')).runForTarget('topic', r.topicId).catch(() => null);
  return { taken: true, version: latest, total: cases.length, failed: failed.map(c => ({ name: c.name, checks: c.checks })) };
}

/** See the difference between the version a step is on and the newest one. */
export async function versionDiff(ruleId: string, user: AuthUser) {
  const r = await prisma.rule.findUnique({ where: { id: ruleId } }); const ref = refOf(r);
  if (!r || !ref) throw new NotFoundError('Library reference');
  await assertProjectAccess(r.projectId, user);
  const item = await prisma.rule.findUnique({ where: { id: ref.itemId } }); if (!item) throw new NotFoundError('Library item');
  const latest = await latestApproved(item.id);
  const from = await baseOf(item, ref.pin === 'latest' ? (ref.version ?? 'latest') : ref.pin); const to = await baseOf(item, 'latest');
  const d = deriveDiff(r.type, from.definition, to.definition);
  const fl = linesOf(r.type, from.definition); const fk = keysOf(r.type, fl);
  return { item: item.name, from: from.version, to: latest, type: r.type, columns: { inputs: (to.definition as any)?.inputs || [], outputs: (to.definition as any)?.outputs || [] },
    removed: (d.off || []).map(k => fl[fk.indexOf(k)]).filter(Boolean), added: (d.added || []).map(a => a.line) };
}

/** Home "Needs you": steps on a fixed version while a newer approved one exists. */
export async function behind(projectIds: string[]) {
  const refs = await prisma.rule.findMany({ where: { projectId: { in: projectIds }, libraryRef: { not: Prisma.AnyNull } }, select: { id: true, name: true, topicId: true, projectId: true, libraryRef: true } });
  const pinned = refs.filter(r => { const x = refOf(r); return x && x.mode !== 'own' && x.pin !== 'latest'; });
  if (!pinned.length) return [];
  const topics = await prisma.topic.findMany({ where: { id: { in: pinned.map(r => r.topicId).filter(Boolean) as string[] } }, select: { id: true, name: true, product: true } });
  const out: any[] = [];
  for (const r of pinned) {
    const x = refOf(r)!; const latest = await latestApproved(x.itemId);
    if (latest != null && latest > Number(x.pin)) { const t = topics.find(y => y.id === r.topicId); out.push({ ruleId: r.id, name: r.name, topicId: r.topicId, projectId: r.projectId, topic: t?.name, product: t?.product, pin: x.pin, latest }); }
  }
  return out;
}

// ---- Helpers: lines two products both hold → Move to library; same line but one number → Make it a setting
const NUM = /-?\d+(?:\.\d+)?/g;
const shape = (s: string) => s.replace(NUM, '#');
function fieldsOf(type: string, line: any): { field: string; text: string }[] {
  if (String(type).toUpperCase() === 'FORMULA') return [{ field: 'expr', text: String(line?.expr ?? '') }];
  return [...(line?.inputs || []).map((c: any, i: number) => ({ field: `inputs.${i}`, text: typeof c === 'string' ? c : JSON.stringify(c ?? '') })),
    ...(line?.outputs || []).map((c: any, i: number) => ({ field: `outputs.${i}`, text: typeof c === 'string' ? c : JSON.stringify(c ?? '') }))];
}
export async function duplicates(projectIdOrSlug: string, user: AuthUser) {
  const p = await assertProjectAccess(projectIdOrSlug, user);
  const topics = await prisma.topic.findMany({ where: { projectId: p.id, deletedAt: null, product: { not: null } }, select: { id: true, name: true, product: true } });
  const rules = (await prisma.rule.findMany({ where: { projectId: p.id, topicId: { in: topics.map(t => t.id) }, library: false, type: { in: ['DECISION_TABLE', 'FORMULA'] as any } } }))
    .filter(r => !refOf(r) || refOf(r)!.mode === 'own');
  const prod = (r: any) => topics.find(t => t.id === r.topicId)?.product || '';
  const moves: any[] = []; const settings: any[] = [];
  for (let i = 0; i < rules.length; i++) for (let j = i + 1; j < rules.length; j++) {
    const a = rules[i], b = rules[j];
    if (a.type !== b.type || prod(a) === prod(b)) continue;
    const la = linesOf(a.type, a.definition), lb = linesOf(b.type, b.definition);
    if (!la.length || !lb.length) continue;
    const sa = la.map(l => JSON.stringify(bare(l))); const sb = new Set(lb.map(l => JSON.stringify(bare(l))));
    const equal = sa.filter(x => sb.has(x)).length;
    if (equal >= 2 || (equal >= 1 && equal >= Math.min(la.length, lb.length) / 2)) moves.push({ a: { ruleId: a.id, name: a.name, product: prod(a), topicId: a.topicId }, b: { ruleId: b.id, name: b.name, product: prod(b), topicId: b.topicId }, equal, of: Math.max(la.length, lb.length) });
    // a line that differs only in one number
    la.forEach((x, ia) => lb.forEach((y, ib) => {
      if (JSON.stringify(bare(x)) === JSON.stringify(bare(y))) return;
      const fx = fieldsOf(a.type, x), fy = fieldsOf(b.type, y);
      if (fx.length !== fy.length || fx.some((f, k) => shape(f.text) !== shape(fy[k].text))) return;
      // names must match too (a calculation line's word)
      if (a.type === 'FORMULA' && x?.name !== y?.name) return;
      const k = fx.findIndex((f, n) => f.text !== fy[n].text); if (k < 0) return;
      const nx = Array.from(fx[k].text.matchAll(NUM)), ny = Array.from(fy[k].text.matchAll(NUM));
      const m = nx.findIndex((n, q) => n[0] !== ny[q]?.[0]); if (m < 0) return;
      if (settings.length < 40) settings.push({ field: fx[k].field, label: a.type === 'FORMULA' ? String(x?.name || '') : '',
        a: { ruleId: a.id, name: a.name, product: prod(a), line: ia, from: nx[m].index, to: nx[m].index! + nx[m][0].length, value: Number(nx[m][0]), text: fx[k].text },
        b: { ruleId: b.id, name: b.name, product: prod(b), line: ib, from: ny[m].index, to: ny[m].index! + ny[m][0].length, value: Number(ny[m][0]), text: fy[k].text } });
    }));
  }
  return { moves, settings };
}

// ---- New product from <product>: each step Use / Extend / Own; settings and test cases copied
export async function newProduct(data: { topicId: string; product: string; name?: string; modes?: Record<string, Mode>; copyCases?: boolean }, user: AuthUser) {
  const src = await prisma.topic.findFirst({ where: { id: data.topicId, deletedAt: null } }); if (!src) throw new NotFoundError('Topic');
  await assertProjectAccess(src.projectId, user, 'write');
  const product = String(data.product || '').trim(); if (!product) throw new ValidationError('Name the new product');
  if (await prisma.topic.findFirst({ where: { projectId: src.projectId, deletedAt: null, product, name: data.name?.trim() || src.name } })) throw new ValidationError(`${product} already has a topic named ${data.name?.trim() || src.name}`);
  const rules = await prisma.rule.findMany({ where: { topicId: src.id } });
  const t = await prisma.topic.create({ data: { projectId: src.projectId, name: data.name?.trim() || src.name, description: src.description, goal: src.goal, shape: src.shape, product, settings: src.settings ?? undefined, createdById: user.userId } });
  const map = new Map<string, string>();
  for (const r of rules) {
    const mode: Mode = (data.modes?.[r.id] as Mode) || 'use';
    let ref = refOf(r);
    if (mode !== 'own' && SHARABLE.has(String(r.type)) && (!ref || ref.mode === 'own')) {
      // not shared yet: the source moves to the library first, then both use it
      const item = await newItem(r, user); await attach(r.id, item.id); ref = refOf(await prisma.rule.findUnique({ where: { id: r.id } }));
    }
    const slug = await newSlug(src.projectId, `${r.name} ${product}`);
    if (mode === 'own' || !ref || !SHARABLE.has(String(r.type))) {
      const c = await prisma.rule.create({ data: { projectId: src.projectId, topicId: t.id, name: r.name, slug, alias: slug, type: r.type, definition: r.definition || {}, ruleVariables: r.ruleVariables ?? undefined, createdById: user.userId, status: 'DRAFT',
        ...(ref && { libraryRef: { itemId: ref.itemId, mode: 'own', pin: ref.pin, copiedFrom: { id: ref.itemId, name: r.name, version: ref.version ?? 1 } } as any }) } });
      map.set(r.id, c.id);
    } else {
      const c = await prisma.rule.create({ data: { projectId: src.projectId, topicId: t.id, name: r.name, slug, alias: slug, type: r.type, definition: r.definition || {}, ruleVariables: r.ruleVariables ?? undefined, createdById: user.userId, status: 'PUBLISHED',
        libraryRef: { itemId: ref.itemId, mode, pin: ref.pin, diff: mode === 'extend' ? ref.diff || {} : {} } as any } });
      await refresh(c.id); map.set(r.id, c.id);
    }
  }
  const stages = (Array.isArray(src.stages) ? (src.stages as any[]) : []).map(s => ({ ...s, id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, items: (s.items || []).map((i: string) => map.get(i)).filter(Boolean) }));
  if (stages.length) await prisma.topic.update({ where: { id: t.id }, data: { stages } });
  const settings = src.product ? await (await import('./product-settings.js')).copyColumn(src.projectId, src.product, product) : 0;
  let cases = 0;
  if (data.copyCases !== false) {
    const cs = await prisma.testCase.findMany({ where: { deletedAt: null, targetType: 'topic', targetId: src.id } });
    for (const c of cs) { await prisma.testCase.create({ data: { projectId: c.projectId, name: c.name, targetType: 'topic', targetId: t.id, input: c.input ?? {}, expectations: c.expectations ?? undefined, expected: c.expected ?? undefined } }); cases++; }
  }
  return { id: t.id, decisions: map.size, settings, cases };
}
