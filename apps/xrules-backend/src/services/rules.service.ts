import { prisma } from '../config/database.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import { generateSlug } from '../utils/slug.js';
import type { AuthUser } from '../middleware/auth.js';

function formatRule(rule: any) {
  return {
    id: rule.id,
    name: rule.name,
    slug: rule.slug,
    alias: rule.alias,
    description: rule.description,
    type: rule.type.toLowerCase(),
    // "engine" kept for back-compat; "solver" is the new canonical name (DR convention).
    engine: rule.engine || rule.solver || 'rules',
    solver: rule.solver || rule.engine || 'rules',
    strategy: (rule.strategy || 'STANDARD').toLowerCase(),
    locked: rule.locked || false,
    lockedById: rule.lockedById,
    folderId: rule.folderId,
    tags: rule.tags || [],
    status: rule.status.toLowerCase(),
    version: rule.version,
    projectId: rule.projectId,
    workspaceId: rule.project?.workspaceId,
    workspaceSlug: rule.project?.workspace?.slug,
    definition: rule.definition,
    ruleVariables: rule.ruleVariables,
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

// Generate a URL-safe alias from a name. Same rules as slug (a-z 0-9 -).
function generateAlias(name: string): string {
  return generateSlug(name);
}

export async function setLock(id: string, locked: boolean, user: AuthUser) {
  const rule = await prisma.rule.findUnique({
    where: { id }, include: { project: true },
  });
  if (!rule) throw new NotFoundError('Rule');
  await checkMembership(rule.project.workspaceId, user.userId, ['OWNER', 'ADMIN', 'MEMBER', 'EDITOR']);
  const updated = await prisma.rule.update({
    where: { id },
    data: {
      locked,
      lockedById: locked ? user.userId : null,
    },
    include: { project: { include: { workspace: true } }, createdBy: true, _count: { select: { executions: true } } },
  });
  return formatRule(updated);
}

export async function findByAlias(projectId: string, alias: string, user: AuthUser) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError('Project');
  await checkMembership(project.workspaceId, user.userId);
  const rule = await prisma.rule.findUnique({
    where: { projectId_alias: { projectId, alias } },
    include: { project: { include: { workspace: true } }, createdBy: true, _count: { select: { executions: true } } },
  });
  if (!rule) throw new NotFoundError('Rule');
  return formatRule(rule);
}

export async function setAlias(id: string, alias: string, user: AuthUser) {
  const sanitized = alias.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  if (!sanitized) throw new ValidationError('alias must contain at least one a-z/0-9 character');
  const rule = await prisma.rule.findUnique({
    where: { id }, include: { project: true },
  });
  if (!rule) throw new NotFoundError('Rule');
  await checkMembership(rule.project.workspaceId, user.userId, ['OWNER', 'ADMIN', 'MEMBER', 'EDITOR']);
  const updated = await prisma.rule.update({
    where: { id },
    data: { alias: sanitized },
    include: { project: { include: { workspace: true } }, createdBy: true, _count: { select: { executions: true } } },
  });
  return formatRule(updated);
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

export async function listRules(projectIdOrSlug: string, user: AuthUser, statusFilter?: string) {
  // Accept project id OR slug.
  const project = await prisma.project.findFirst({
    where: { OR: [{ id: projectIdOrSlug }, { slug: projectIdOrSlug }] },
    include: { workspace: true },
  });

  if (!project) {
    throw new NotFoundError('Project');
  }

  await checkMembership(project.workspaceId, user.userId);

  const where: any = { projectId: project.id };
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

export async function getRule(idOrSlug: string, user: AuthUser) {
  // Accept id, slug, or alias. CUIDs are 24-25 chars, lowercase alphanumeric;
  // slugs/aliases use kebab-case so contain hyphens.
  const looksLikeId = /^[a-z0-9]{20,30}$/i.test(idOrSlug);
  let rule = looksLikeId
    ? await prisma.rule.findUnique({
        where: { id: idOrSlug },
        include: {
          project: { include: { workspace: true } },
          createdBy: true,
          _count: { select: { executions: true } },
        },
      })
    : null;
  if (!rule) {
    // Project-scoped slug/alias lookup — for the user, return the first
    // matching rule across their accessible projects.
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: user.userId },
      select: { workspaceId: true },
    });
    const wsIds = memberships.map(m => m.workspaceId);
    const matches = await prisma.rule.findMany({
      where: {
        OR: [{ slug: idOrSlug }, { alias: idOrSlug }],
        project: { workspaceId: { in: wsIds } },
      },
      include: {
        project: { include: { workspace: true } },
        createdBy: true,
        _count: { select: { executions: true } },
      },
      take: 1,
    });
    rule = matches[0] || null;
  }

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

  // Auto-generate alias matching slug; user can rename later (DR convention).
  let alias = baseSlug;
  let aliasCounter = 1;
  while (await prisma.rule.findUnique({ where: { projectId_alias: { projectId: data.project_id, alias } } })) {
    alias = `${baseSlug}-${aliasCounter}`;
    aliasCounter++;
  }

  const ruleType = (data.type || 'DECISION_TABLE').toUpperCase() as any;
  const solver = data.engine || (ruleType === 'AI_AGENT' ? 'ai' : ruleType === 'LOOKUP' ? 'lookup' : 'rules');

  const rule = await prisma.rule.create({
    data: {
      name: data.name,
      slug, alias,
      description: data.description,
      type: ruleType,
      engine: solver, solver,
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

  if (rule.locked && rule.lockedById !== user.userId) {
    throw new ValidationError('Rule is locked. Unlock it before editing.');
  }

  await checkMembership(rule.project.workspaceId, user.userId, ['OWNER', 'ADMIN', 'MEMBER']);

  const updateData: any = {};
  if (data.name) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.definition) updateData.definition = data.definition;
  if (data.input_schema) updateData.inputSchema = data.input_schema;
  if (data.output_schema) updateData.outputSchema = data.output_schema;
  if (data.engine) { updateData.engine = data.engine; updateData.solver = data.engine; }
  if ((data as any).alias !== undefined) {
    const a = String((data as any).alias).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    if (a) updateData.alias = a;
  }
  if ((data as any).strategy) updateData.strategy = String((data as any).strategy).toUpperCase();
  if ((data as any).ruleVariables !== undefined) updateData.ruleVariables = (data as any).ruleVariables;
  if ((data as any).folderId !== undefined) updateData.folderId = (data as any).folderId;
  if ((data as any).tags !== undefined) updateData.tags = (data as any).tags;
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
