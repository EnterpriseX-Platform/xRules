// Diff two rule versions (or two rules) — produces a structural diff.
import { prisma } from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';
import { assertProjectAccess } from './_access.js';
import type { AuthUser } from '../middleware/auth.js';

interface DiffEntry { path: string; op: 'add' | 'remove' | 'replace'; left?: any; right?: any }

function diffJson(a: any, b: any, path = '$', out: DiffEntry[] = []): DiffEntry[] {
  if (a === b) return out;
  if (a === undefined) { out.push({ path, op: 'add', right: b }); return out; }
  if (b === undefined) { out.push({ path, op: 'remove', left: a }); return out; }
  const ta = Array.isArray(a) ? 'array' : typeof a;
  const tb = Array.isArray(b) ? 'array' : typeof b;
  if (ta !== tb || (ta !== 'object' && ta !== 'array')) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      out.push({ path, op: 'replace', left: a, right: b });
    }
    return out;
  }
  if (ta === 'array') {
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) diffJson(a[i], b[i], `${path}[${i}]`, out);
    return out;
  }
  // object
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) diffJson(a[k], b[k], `${path}.${k}`, out);
  return out;
}

// Compare two versions of the SAME rule.
export async function compareVersions(ruleId: string, versionA: number, versionB: number, user: AuthUser) {
  const rule = await prisma.rule.findUnique({ where: { id: ruleId } });
  if (!rule) throw new NotFoundError('Rule');
  await assertProjectAccess(rule.projectId, user);

  async function load(v: number) {
    if (v === rule!.version) {
      return { version: rule!.version, definition: rule!.definition, inputSchema: rule!.inputSchema, outputSchema: rule!.outputSchema };
    }
    const rv = await prisma.ruleVersion.findUnique({ where: { ruleId_version: { ruleId, version: v } } });
    if (!rv) throw new NotFoundError(`Version ${v}`);
    return { version: v, definition: rv.definition, inputSchema: rv.inputSchema, outputSchema: rv.outputSchema };
  }

  const [A, B] = await Promise.all([load(versionA), load(versionB)]);
  return {
    ruleId, ruleName: rule.name, ruleType: rule.type,
    a: A, b: B,
    diff: {
      definition:   diffJson(A.definition, B.definition),
      inputSchema:  diffJson(A.inputSchema, B.inputSchema),
      outputSchema: diffJson(A.outputSchema, B.outputSchema),
    },
  };
}

// Compare two different rules (must be same type per DR convention).
export async function compareRules(idA: string, idB: string, user: AuthUser) {
  const [a, b] = await Promise.all([
    prisma.rule.findUnique({ where: { id: idA } }),
    prisma.rule.findUnique({ where: { id: idB } }),
  ]);
  if (!a) throw new NotFoundError(`Rule ${idA}`);
  if (!b) throw new NotFoundError(`Rule ${idB}`);
  await assertProjectAccess(a.projectId, user);
  await assertProjectAccess(b.projectId, user);
  if (a.type !== b.type) {
    throw new Error('Cannot compare rules of different types');
  }
  return {
    a: { id: a.id, name: a.name, type: a.type, version: a.version, definition: a.definition },
    b: { id: b.id, name: b.name, type: b.type, version: b.version, definition: b.definition },
    diff: { definition: diffJson(a.definition, b.definition) },
  };
}
