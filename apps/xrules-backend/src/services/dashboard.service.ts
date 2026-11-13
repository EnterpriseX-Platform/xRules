import { prisma } from '../config/database.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';
import type { AuthUser } from '../middleware/auth.js';

export async function getDashboard(workspaceSlug: string, user: AuthUser) {
  const workspace = await prisma.workspace.findUnique({ where: { slug: workspaceSlug } });
  if (!workspace) throw new NotFoundError('Workspace');

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: workspace.id, userId: user.userId },
  });
  if (!membership) throw new ForbiddenError('Access denied');

  const projects = await prisma.project.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true },
  });
  const projectIds = projects.map(p => p.id);

  const [
    projectCount,
    ruleCount,
    flowCount,
    modelCount,
    executionCount,
    recentExecutions,
    recentProjects,
    memberCount,
  ] = await Promise.all([
    prisma.project.count({ where: { workspaceId: workspace.id } }),
    prisma.rule.count({ where: { projectId: { in: projectIds } } }),
    prisma.flow.count({ where: { projectId: { in: projectIds } } }),
    prisma.model.count({ where: { projectId: { in: projectIds } } }),
    prisma.execution.count({ where: { rule: { projectId: { in: projectIds } } } }),
    prisma.execution.findMany({
      where: { rule: { projectId: { in: projectIds } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { rule: { select: { id: true, name: true, type: true } } },
    }),
    prisma.project.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: { _count: { select: { rules: true } } },
    }),
    prisma.workspaceMember.count({ where: { workspaceId: workspace.id } }),
  ]);

  // Today's executions
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const executionsToday = await prisma.execution.count({
    where: { rule: { projectId: { in: projectIds } }, createdAt: { gte: today } },
  });

  return {
    stats: {
      projects: projectCount,
      rules: ruleCount,
      flows: flowCount,
      models: modelCount,
      executions: executionCount,
      executionsToday,
      members: memberCount,
    },
    recentExecutions: recentExecutions.map(e => ({
      id: e.id,
      ruleName: e.rule?.name ?? (e as any).flow?.name ?? 'Flow',
      ruleType: e.rule?.type.toLowerCase() ?? 'flow',
      status: e.status.toLowerCase(),
      duration: e.duration,
      createdAt: e.createdAt.toISOString(),
    })),
    recentProjects: recentProjects.map(p => ({
      id: p.id,
      name: p.name,
      ruleCount: p._count.rules,
      updatedAt: p.updatedAt.toISOString(),
    })),
  };
}
