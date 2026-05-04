// Business Intelligence — query the execution audit log with cursor pagination.
// Backed by the Execution table (every solve gets logged with apiKey + correlation).
import { prisma } from '../config/database.js';
import { assertWorkspaceAccess } from './_access.js';
import type { AuthUser } from '../middleware/auth.js';

interface ListOpts {
  workspaceId: string;
  ruleIds?: string[];
  correlationIds?: string[];
  apiKeyIds?: string[];
  tags?: string[];
  dateGte?: string;
  dateLte?: string;
  status?: string[];
  pageSize?: number;
  after?: string; // cursor (Execution.id)
  fields?: string[];
}

export async function listAudits(opts: ListOpts, user: AuthUser) {
  await assertWorkspaceAccess(opts.workspaceId, user, 'read');

  const where: any = {
    rule: { project: { workspaceId: opts.workspaceId } },
  };

  if (opts.ruleIds?.length) where.ruleId = { in: opts.ruleIds };
  if (opts.correlationIds?.length) where.id = { in: opts.correlationIds };
  if (opts.apiKeyIds?.length) where.apiKeyId = { in: opts.apiKeyIds };
  if (opts.dateGte || opts.dateLte) {
    where.createdAt = {};
    if (opts.dateGte) where.createdAt.gte = new Date(opts.dateGte);
    if (opts.dateLte) where.createdAt.lte = new Date(opts.dateLte);
  }
  if (opts.status?.length) where.status = { in: opts.status.map(s => s.toUpperCase()) };
  if (opts.tags?.length) {
    where.rule = { ...where.rule, tags: { hasSome: opts.tags } };
  }

  const take = Math.min(opts.pageSize || 100, 1000);
  const args: any = {
    where,
    take: take + 1,
    orderBy: { createdAt: 'desc' },
    include: { rule: { select: { id: true, name: true, slug: true, alias: true, tags: true } } },
  };
  if (opts.after) {
    args.cursor = { id: opts.after };
    args.skip = 1;
  }

  const rows = await prisma.execution.findMany(args);
  const hasMore = rows.length > take;
  const data = rows.slice(0, take);

  // Optional field selection
  const project = (e: any) => {
    const base: any = {
      id: e.id, ruleId: e.ruleId, ruleVersion: e.ruleVersion, status: e.status,
      duration: e.duration, environment: e.environment, apiKeyId: e.apiKeyId,
      createdAt: e.createdAt.toISOString(), rule: e.rule,
    };
    if (!opts.fields || opts.fields.includes('inputData')) base.input = e.input;
    if (!opts.fields || opts.fields.includes('outputData')) base.output = e.output;
    if (e.error) base.error = e.error;
    return base;
  };

  return {
    data: data.map(project),
    pageSize: take,
    nextCursor: hasMore ? data[data.length - 1]?.id : null,
  };
}

export async function countAudits(opts: ListOpts, user: AuthUser) {
  await assertWorkspaceAccess(opts.workspaceId, user, 'read');
  const where: any = { rule: { project: { workspaceId: opts.workspaceId } } };
  if (opts.ruleIds?.length) where.ruleId = { in: opts.ruleIds };
  if (opts.dateGte || opts.dateLte) {
    where.createdAt = {};
    if (opts.dateGte) where.createdAt.gte = new Date(opts.dateGte);
    if (opts.dateLte) where.createdAt.lte = new Date(opts.dateLte);
  }
  return { count: await prisma.execution.count({ where }) };
}

export async function deleteAudits(ids: string[], user: AuthUser, workspaceId: string) {
  await assertWorkspaceAccess(workspaceId, user, 'admin');
  const r = await prisma.execution.deleteMany({
    where: {
      id: { in: ids },
      rule: { project: { workspaceId } },
    },
  });
  return { deleted: r.count };
}
