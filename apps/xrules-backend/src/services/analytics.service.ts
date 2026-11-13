import { prisma } from '../config/database.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';
import type { AuthUser } from '../middleware/auth.js';

async function resolveWorkspace(workspaceSlug: string, user: AuthUser) {
  const workspace = await prisma.workspace.findUnique({ where: { slug: workspaceSlug } });
  if (!workspace) throw new NotFoundError('Workspace');

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: workspace.id, userId: user.userId },
  });
  if (!membership) throw new ForbiddenError('Access denied');

  return workspace;
}

export async function getExecutionSummary(workspaceSlug: string, user: AuthUser) {
  const workspace = await resolveWorkspace(workspaceSlug, user);

  // Get all rule IDs in this workspace
  const projects = await prisma.project.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true },
  });
  const projectIds = projects.map(p => p.id);

  const rules = await prisma.rule.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true },
  });
  const ruleIds = rules.map(r => r.id);

  if (ruleIds.length === 0) {
    return { total: 0, successCount: 0, failedCount: 0, avgDuration: 0 };
  }

  const [total, successCount, failedCount, durationAgg] = await Promise.all([
    prisma.execution.count({ where: { ruleId: { in: ruleIds } } }),
    prisma.execution.count({ where: { ruleId: { in: ruleIds }, status: 'SUCCESS' } }),
    prisma.execution.count({ where: { ruleId: { in: ruleIds }, status: 'FAILED' } }),
    prisma.execution.aggregate({
      where: { ruleId: { in: ruleIds }, duration: { not: null } },
      _avg: { duration: true },
    }),
  ]);

  return {
    total,
    successCount,
    failedCount,
    avgDuration: Math.round(durationAgg._avg.duration || 0),
  };
}

export async function getStatusBreakdown(workspaceSlug: string, user: AuthUser) {
  const workspace = await resolveWorkspace(workspaceSlug, user);

  const projects = await prisma.project.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true },
  });
  const ruleIds = (await prisma.rule.findMany({
    where: { projectId: { in: projects.map(p => p.id) } },
    select: { id: true },
  })).map(r => r.id);

  if (ruleIds.length === 0) return {};

  const groups = await prisma.execution.groupBy({
    by: ['status'],
    where: { ruleId: { in: ruleIds } },
    _count: true,
  });

  const result: Record<string, number> = {};
  groups.forEach(g => {
    result[g.status.toLowerCase()] = g._count;
  });
  return result;
}

export async function getTopRules(workspaceSlug: string, user: AuthUser, limit = 10) {
  const workspace = await resolveWorkspace(workspaceSlug, user);

  const projects = await prisma.project.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true },
  });
  const ruleIds = (await prisma.rule.findMany({
    where: { projectId: { in: projects.map(p => p.id) } },
    select: { id: true },
  })).map(r => r.id);

  if (ruleIds.length === 0) return [];

  const groups = await prisma.execution.groupBy({
    by: ['ruleId'],
    where: { ruleId: { in: ruleIds } },
    _count: true,
    _avg: { duration: true },
    orderBy: { _count: { ruleId: 'desc' } },
    take: limit,
  });

  // Get rule names
  const ids = groups.map(g => g.ruleId).filter((x): x is string => !!x);
  const ruleDetails = await prisma.rule.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, type: true },
  });
  const ruleMap = new Map(ruleDetails.map(r => [r.id, r]));

  // Get success counts per rule
  const successCounts = await prisma.execution.groupBy({
    by: ['ruleId'],
    where: { ruleId: { in: ids }, status: 'SUCCESS' },
    _count: true,
  });
  const successMap = new Map<string | null, number>(successCounts.map(s => [s.ruleId, s._count as number]));

  return groups.map(g => {
    const rule = g.ruleId ? ruleMap.get(g.ruleId) : undefined;
    const successCount = (successMap.get(g.ruleId) as number) || 0;
    return {
      ruleId: g.ruleId,
      ruleName: rule?.name || 'Unknown',
      ruleType: rule?.type?.toLowerCase() || 'unknown',
      count: g._count,
      avgDuration: Math.round(g._avg?.duration || 0),
      successRate: g._count > 0 ? Math.round((successCount / g._count) * 100) : 0,
    };
  });
}

export async function getTimeseries(workspaceSlug: string, user: AuthUser, interval = 'day') {
  const workspace = await resolveWorkspace(workspaceSlug, user);

  const projects = await prisma.project.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true },
  });
  const ruleIds = (await prisma.rule.findMany({
    where: { projectId: { in: projects.map(p => p.id) } },
    select: { id: true },
  })).map(r => r.id);

  if (ruleIds.length === 0) return [];

  // Get last 30 days of executions
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const executions = await prisma.execution.findMany({
    where: {
      ruleId: { in: ruleIds },
      createdAt: { gte: since },
    },
    select: { createdAt: true, status: true },
    orderBy: { createdAt: 'asc' },
  });

  // Group by day
  const groups: Record<string, { total: number; success: number; failed: number }> = {};
  executions.forEach(e => {
    const key = e.createdAt.toISOString().split('T')[0];
    if (!groups[key]) groups[key] = { total: 0, success: 0, failed: 0 };
    groups[key].total++;
    if (e.status === 'SUCCESS') groups[key].success++;
    if (e.status === 'FAILED') groups[key].failed++;
  });

  return Object.entries(groups).map(([date, data]) => ({
    date,
    ...data,
  }));
}
