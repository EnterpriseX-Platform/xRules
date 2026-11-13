import { visibleProjectIds, type TenantCtx } from '../middleware/tenant.js';
import { prisma } from '../config/database.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import type { AuthUser } from '../middleware/auth.js';
import { parsePagination } from '../utils/pagination.js';

export async function listExecutions(
  query: { rule_id?: string; status?: string; page?: string; limit?: string },
  user: AuthUser,
  tenant?: TenantCtx,
) {
  const { page, limit, skip } = parsePagination(query);

  const where: any = {};
  if (tenant) {
    const ids = await visibleProjectIds(user.userId, tenant);
    where.OR = [{ rule: { projectId: { in: ids } } }, { flow: { projectId: { in: ids } } }];
  }

  if (query.rule_id) {
    const rule = await prisma.rule.findUnique({
      where: { id: query.rule_id },
      include: { project: true },
    });

    if (!rule) {
      throw new NotFoundError('Rule');
    }

    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId: rule.project.workspaceId, userId: user.userId },
    });

    if (!membership) {
      throw new ForbiddenError('Access denied');
    }

    where.ruleId = query.rule_id;
  }

  if (query.status) {
    where.status = query.status.toUpperCase();
  }

  const [executions, total] = await Promise.all([
    prisma.execution.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: { rule: { select: { id: true, name: true, type: true } }, flow: { select: { name: true } } },
    }),
    prisma.execution.count({ where }),
  ]);

  return {
    data: executions.map((e) => ({
      id: e.id,
      ruleId: e.ruleId,
      ruleName: e.rule?.name ?? (e as any).flow?.name ?? 'Flow',
      ruleType: e.rule?.type.toLowerCase() ?? 'flow',
      input: e.input,
      output: e.output,
      status: e.status.toLowerCase(),
      duration: e.duration,
      error: e.error,
      createdAt: e.createdAt.toISOString(),
    })),
    meta: { page, limit, total },
  };
}
