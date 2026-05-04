import { prisma } from '../config/database.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import { generateSlug } from '../utils/slug.js';
import type { AuthUser } from '../middleware/auth.js';

function formatRule(rule: any) {
  return {
    id: rule.id,
    name: rule.name,
    slug: rule.slug,
    description: rule.description,
    type: rule.type.toLowerCase(),
    engine: rule.engine || 'rules',
    status: rule.status.toLowerCase(),
    version: rule.version,
    projectId: rule.projectId,
    workspaceId: rule.project?.workspaceId,
    workspaceSlug: rule.project?.workspace?.slug,
    definition: rule.definition,
    inputSchema: rule.inputSchema,
    outputSchema: rule.outputSchema,
    createdBy: rule.createdBy ? {
      id: rule.createdBy.id,
      name: rule.createdBy.name,
      email: rule.createdBy.email,
    } : undefined,
    executionCount: rule._count?.executions ?? 0,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

async function checkMembership(workspaceId: string, userId: string, requiredRoles?: string[]) {
  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId },
  });

  if (!membership) {
    throw new ForbiddenError('Access denied');
  }

  if (requiredRoles && !requiredRoles.includes(membership.role)) {
    throw new ForbiddenError('Insufficient permissions');
  }

  return membership;
}

export async function listRules(projectId: string, user: AuthUser, statusFilter?: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { workspace: true },
  });

  if (!project) {
    throw new NotFoundError('Project');
  }

  await checkMembership(project.workspaceId, user.userId);

  const where: any = { projectId };
  if (statusFilter) {
    where.status = statusFilter.toUpperCase();
  }

  const rules = await prisma.rule.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: { createdBy: true, _count: { select: { executions: true } } },
  });

  return rules.map(formatRule);
}

export async function getRule(id: string, user: AuthUser) {
  const rule = await prisma.rule.findUnique({
    where: { id },
    include: {
      project: { include: { workspace: true } },
      createdBy: true,
      _count: { select: { executions: true } },
    },
  });

  if (!rule) {
    throw new NotFoundError('Rule');
  }

  await checkMembership(rule.project.workspaceId, user.userId);
  return formatRule(rule);
}

export async function createRule(
  data: {
    project_id: string;
    name: string;
    type?: string;
    engine?: string;
    description?: string;
    definition?: object;
    input_schema?: object;
    output_schema?: object;
  },
  user: AuthUser,
) {
  if (!data.project_id || !data.name) {
    throw new ValidationError('Project ID and name are required');
  }

  const project = await prisma.project.findUnique({ where: { id: data.project_id } });
  if (!project) {
    throw new NotFoundError('Project');
  }

  await checkMembership(project.workspaceId, user.userId, ['OWNER', 'ADMIN', 'MEMBER']);

  const baseSlug = generateSlug(data.name);
  let slug = baseSlug;
  let counter = 1;
  while (await prisma.rule.findUnique({ where: { projectId_slug: { projectId: data.project_id, slug } } })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  const ruleType = (data.type || 'DECISION_TABLE').toUpperCase() as any;

  const rule = await prisma.rule.create({
    data: {
      name: data.name,
      slug,
      description: data.description,
      type: ruleType,
      engine: data.engine || 'rules',
      definition: data.definition || {},
      inputSchema: data.input_schema || {},
      outputSchema: data.output_schema || {},
      status: 'DRAFT',
      projectId: data.project_id,
      createdById: user.userId,
    },
    include: { createdBy: true },
  });

  return formatRule({ ...rule, _count: { executions: 0 } });
}

export async function updateRule(
  id: string,
  data: {
    name?: string;
    description?: string | null;
    definition?: object;
    input_schema?: object;
    output_schema?: object;
    status?: string;
    engine?: string;
  },
  user: AuthUser,
) {
  const rule = await prisma.rule.findUnique({
    where: { id },
    include: { project: true },
  });

  if (!rule) {
    throw new NotFoundError('Rule');
  }

  await checkMembership(rule.project.workspaceId, user.userId, ['OWNER', 'ADMIN', 'MEMBER']);

  const updateData: any = {};
  if (data.name) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.definition) updateData.definition = data.definition;
  if (data.input_schema) updateData.inputSchema = data.input_schema;
  if (data.output_schema) updateData.outputSchema = data.output_schema;
  if (data.engine) updateData.engine = data.engine;
  if (data.status) {
    updateData.status = data.status.toUpperCase();
    if (data.status.toUpperCase() === 'PUBLISHED' && rule.status !== 'PUBLISHED') {
      updateData.version = rule.version + 1;
    }
  }

  const updated = await prisma.rule.update({
    where: { id },
    data: updateData,
    include: { createdBy: true },
  });

  return formatRule(updated);
}

export async function deleteRule(id: string, user: AuthUser) {
  const rule = await prisma.rule.findUnique({
    where: { id },
    include: { project: true },
  });

  if (!rule) {
    throw new NotFoundError('Rule');
  }

  await checkMembership(rule.project.workspaceId, user.userId, ['OWNER', 'ADMIN']);
  await prisma.rule.delete({ where: { id } });
}

export async function publishRule(id: string, user: AuthUser) {
  const rule = await prisma.rule.findUnique({
    where: { id },
    include: { project: true, createdBy: true },
  });

  if (!rule) {
    throw new NotFoundError('Rule');
  }

  await checkMembership(rule.project.workspaceId, user.userId, ['OWNER', 'ADMIN', 'MEMBER']);

  // Snapshot current state to RuleVersion before publishing
  await prisma.ruleVersion.create({
    data: {
      version: rule.version,
      definition: (rule.definition || {}) as any,
      inputSchema: rule.inputSchema as any,
      outputSchema: rule.outputSchema as any,
      status: rule.status,
      message: `Version ${rule.version}`,
      ruleId: rule.id,
      createdById: user.userId,
    },
  });

  const updated = await prisma.rule.update({
    where: { id },
    data: { status: 'PUBLISHED', version: rule.version + 1 },
    include: { createdBy: true },
  });

  return formatRule(updated);
}

export async function getRuleVersions(id: string, user: AuthUser) {
  const rule = await prisma.rule.findUnique({
    where: { id },
    include: { project: { include: { workspace: true } }, createdBy: true },
  });

  if (!rule) {
    throw new NotFoundError('Rule');
  }

  await checkMembership(rule.project.workspaceId, user.userId);

  const versions = await prisma.ruleVersion.findMany({
    where: { ruleId: id },
    orderBy: { version: 'desc' },
    include: { createdBy: true },
  });

  // Always include current version at the top
  const result = [
    {
      version: rule.version,
      ruleId: rule.id,
      message: rule.status === 'PUBLISHED' ? 'Current published version' : 'Current draft',
      author: { id: rule.createdBy.id, name: rule.createdBy.name, email: rule.createdBy.email },
      createdAt: rule.updatedAt.toISOString(),
      timestamp: rule.updatedAt.toISOString(),
      changeStats: { added: 0, modified: 0, deleted: 0 },
      isActive: true,
    },
    ...versions.map((v) => ({
      version: v.version,
      ruleId: v.ruleId,
      message: v.message || `Version ${v.version}`,
      author: { id: v.createdBy.id, name: v.createdBy.name, email: v.createdBy.email },
      createdAt: v.createdAt.toISOString(),
      timestamp: v.createdAt.toISOString(),
      changeStats: v.changeStats || { added: 0, modified: 0, deleted: 0 },
      isActive: false,
    })),
  ];

  return result;
}

export async function restoreRuleVersion(id: string, version: number, user: AuthUser) {
  const rule = await prisma.rule.findUnique({
    where: { id },
    include: { project: true, createdBy: true },
  });

  if (!rule) {
    throw new NotFoundError('Rule');
  }

  await checkMembership(rule.project.workspaceId, user.userId, ['OWNER', 'ADMIN']);

  const ruleVersion = await prisma.ruleVersion.findUnique({
    where: { ruleId_version: { ruleId: id, version } },
  });

  if (!ruleVersion) {
    throw new NotFoundError('Rule version');
  }

  const updated = await prisma.rule.update({
    where: { id },
    data: {
      definition: ruleVersion.definition as any,
      inputSchema: ruleVersion.inputSchema as any,
      outputSchema: ruleVersion.outputSchema as any,
      status: 'DRAFT',
    },
    include: { createdBy: true },
  });

  return formatRule(updated);
}
