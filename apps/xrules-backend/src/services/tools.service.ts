// Maintenance tools — duplicate row detection + dependency analysis.
import { prisma } from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';
import { assertProjectAccess } from './_access.js';
import type { AuthUser } from '../middleware/auth.js';

// Detect duplicate rows in a Decision Table — same condition values across rows.
export async function duplicates(ruleId: string, version: number | undefined, user: AuthUser) {
  const rule = await prisma.rule.findUnique({ where: { id: ruleId } });
  if (!rule) throw new NotFoundError('Rule');
  await assertProjectAccess(rule.projectId, user);

  let def: any = rule.definition;
  if (version && version !== rule.version) {
    const v = await prisma.ruleVersion.findUnique({ where: { ruleId_version: { ruleId, version } } });
    if (v) def = v.definition;
  }

  const rules: any[] = (def?.rules || []);
  // Group rows by their input signature; flag any group with > 1 row.
  const groups = new Map<string, number[]>();
  rules.forEach((row, idx) => {
    const key = JSON.stringify(row.inputs || []);
    const list = groups.get(key) || [];
    list.push(idx);
    groups.set(key, list);
  });
  const duplicates: { signature: any; rowIndices: number[] }[] = [];
  for (const [sig, idxs] of groups) {
    if (idxs.length > 1) duplicates.push({ signature: JSON.parse(sig), rowIndices: idxs });
  }

  return { ruleId, version: version || rule.version, totalRows: rules.length, duplicateGroups: duplicates };
}

// Find rules that reference this rule's id (via definition) and rules this rule references.
export async function dependencies(ruleId: string, _version: number | undefined, user: AuthUser) {
  const rule = await prisma.rule.findUnique({ where: { id: ruleId } });
  if (!rule) throw new NotFoundError('Rule');
  await assertProjectAccess(rule.projectId, user);

  // From the explicit dependency table (DRD edges that have been recorded)
  const edges = await prisma.ruleDependency.findMany({
    where: { OR: [{ fromId: ruleId }, { toId: ruleId }] },
    include: {
      from: { select: { id: true, name: true, slug: true, alias: true, type: true } },
      to:   { select: { id: true, name: true, slug: true, alias: true, type: true } },
    },
  });

  const upstream   = edges.filter(e => e.toId === ruleId).map(e => e.from);
  const downstream = edges.filter(e => e.fromId === ruleId).map(e => e.to);

  // Best-effort scan: search flows in same project for nodes that reference this rule.
  const flows = await prisma.flow.findMany({
    where: { projectId: rule.projectId },
    select: { id: true, name: true, slug: true, graph: true },
  });
  const flowsThatCallRule = flows.filter(f => {
    const nodes = (f.graph as any)?.nodes || [];
    return nodes.some((n: any) =>
      n?.data?.ruleId === ruleId || n?.data?.ruleSlug === rule.slug || n?.data?.ruleAlias === rule.alias
    );
  }).map(f => ({ id: f.id, name: f.name, slug: f.slug }));

  return {
    ruleId,
    upstream,         // rules that call this rule
    downstream,       // rules this rule calls
    flows: flowsThatCallRule,
  };
}

// DRD — full graph of a project: all rules (nodes) + all RuleDependency edges,
// plus inferred edges from flow graphs (nodes that ref ruleId/ruleSlug/ruleAlias).
export async function projectDrd(projectIdOrSlug: string, user: AuthUser) {
  const project = await assertProjectAccess(projectIdOrSlug, user);
  const projectId = project.id;

  const [rules, edges, flows] = await Promise.all([
    prisma.rule.findMany({
      where: { projectId },
      select: { id: true, name: true, slug: true, alias: true, type: true, status: true, version: true },
    }),
    prisma.ruleDependency.findMany({
      where: { from: { projectId }, to: { projectId } },
      select: { fromId: true, toId: true, kind: true },
    }),
    prisma.flow.findMany({
      where: { projectId },
      select: { id: true, name: true, slug: true, graph: true },
    }),
  ]);

  // Inferred flow → rule "calls" edges. Use composite ids "flow:<id>" for flow nodes.
  const flowNodes: any[] = flows.map(f => ({
    id: `flow:${f.id}`, name: f.name, slug: f.slug, type: 'FLOW', isFlow: true,
  }));
  const inferredEdges: { fromId: string; toId: string; kind: string }[] = [];
  const ruleBySlug = new Map(rules.map(r => [r.slug, r]));
  const ruleByAlias = new Map(rules.filter(r => r.alias).map(r => [r.alias!, r]));

  for (const f of flows) {
    const nodes = ((f.graph as any)?.nodes || []) as any[];
    for (const n of nodes) {
      const d = n?.data || {};
      let target: any = null;
      if (d.ruleId)    target = rules.find(r => r.id === d.ruleId);
      if (!target && d.ruleSlug)  target = ruleBySlug.get(d.ruleSlug);
      if (!target && d.ruleAlias) target = ruleByAlias.get(d.ruleAlias);
      if (target) inferredEdges.push({ fromId: `flow:${f.id}`, toId: target.id, kind: 'flow_call' });
    }
  }

  return {
    nodes: [
      ...rules.map(r => ({ ...r, isFlow: false })),
      ...flowNodes,
    ],
    edges: [
      ...edges,
      ...inferredEdges,
    ],
  };
}
