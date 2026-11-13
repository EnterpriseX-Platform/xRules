import crypto from 'crypto';
import { prisma } from '../config/database.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import type { AuthUser } from '../middleware/auth.js';

const KEY_PREFIX = 'xr_live_';

function generateKey(): string {
  return KEY_PREFIX + crypto.randomBytes(24).toString('base64url');
}

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export async function listApiKeys(workspaceSlug: string, user: AuthUser) {
  const workspace = await prisma.workspace.findUnique({ where: { slug: workspaceSlug } });
  if (!workspace) throw new NotFoundError('Workspace');

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: workspace.id, userId: user.userId },
  });
  if (!membership) throw new ForbiddenError('Access denied');

  const keys = await prisma.apiKey.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: 'desc' },
    include: { createdBy: { select: { id: true, name: true, email: true } } },
  });

  return keys.map(k => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scopes: k.scopes,
    specIds: k.specIds,
    rateLimitPerMin: k.rateLimitPerMin,
    active: k.active,
    systemName: k.systemName,
    expiresAt: k.expiresAt?.toISOString() || null,
    lastUsedAt: k.lastUsedAt?.toISOString() || null,
    createdBy: k.createdBy,
    createdAt: k.createdAt.toISOString(),
  }));
}

export async function createApiKey(
  data: { name: string; scopes?: string[]; expiresInDays?: number; workspaceSlug?: string; specIds?: string[]; rateLimitPerMin?: number; systemName?: string },
  user: AuthUser,
) {
  if (!data.name) throw new ValidationError('Name is required');

  const workspaceSlug = data.workspaceSlug || user.tenantId;
  const workspace = await prisma.workspace.findUnique({ where: { slug: workspaceSlug || '' } });
  if (!workspace) throw new NotFoundError('Workspace');

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: workspace.id, userId: user.userId },
  });
  if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
    throw new ForbiddenError('Only OWNER/ADMIN can create API keys');
  }

  const rawKey = generateKey();
  const keyHash = hashKey(rawKey);
  const prefix = rawKey.substring(0, KEY_PREFIX.length + 8) + '...';

  const expiresAt = data.expiresInDays
    ? new Date(Date.now() + data.expiresInDays * 86400000)
    : null;

  const apiKey = await prisma.apiKey.create({
    data: {
      name: data.name,
      keyHash,
      prefix,
      scopes: data.scopes || ['execute'],
      expiresAt,
      specIds: data.specIds || [],
      rateLimitPerMin: data.rateLimitPerMin || 600,
      systemName: data.systemName,
      workspaceId: workspace.id,
      createdById: user.userId,
    },
  });

  // Return the raw key ONLY on creation (never stored, never shown again)
  return {
    id: apiKey.id,
    name: apiKey.name,
    key: rawKey,
    prefix: apiKey.prefix,
    scopes: apiKey.scopes,
    specIds: apiKey.specIds,
    rateLimitPerMin: apiKey.rateLimitPerMin,
    systemName: apiKey.systemName,
    expiresAt: apiKey.expiresAt?.toISOString() || null,
    createdAt: apiKey.createdAt.toISOString(),
  };
}

/** Change which APIs a key may call, its limit, expiry, or switch it on/off. */
export async function updateApiKey(id: string, data: { specIds?: string[]; rateLimitPerMin?: number; active?: boolean; systemName?: string; expiresAt?: string | null; name?: string }, user: AuthUser) {
  const apiKey = await prisma.apiKey.findUnique({ where: { id } });
  if (!apiKey) throw new NotFoundError('API Key');
  const membership = await prisma.workspaceMember.findFirst({ where: { workspaceId: apiKey.workspaceId, userId: user.userId } });
  if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) throw new ForbiddenError('Only OWNER/ADMIN can change API keys');
  const u: any = {};
  for (const k of ['specIds', 'rateLimitPerMin', 'active', 'systemName', 'name'] as const) if ((data as any)[k] !== undefined) u[k] = (data as any)[k];
  if (data.expiresAt !== undefined) u.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
  const k = await prisma.apiKey.update({ where: { id }, data: u });
  return { id: k.id, name: k.name, prefix: k.prefix, specIds: k.specIds, rateLimitPerMin: k.rateLimitPerMin, active: k.active, systemName: k.systemName, expiresAt: k.expiresAt?.toISOString() || null, lastUsedAt: k.lastUsedAt?.toISOString() || null };
}

export async function revokeApiKey(id: string, user: AuthUser) {
  const apiKey = await prisma.apiKey.findUnique({
    where: { id },
    include: { workspace: true },
  });
  if (!apiKey) throw new NotFoundError('API Key');

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: apiKey.workspaceId, userId: user.userId },
  });
  if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
    throw new ForbiddenError('Only OWNER/ADMIN can revoke API keys');
  }

  await prisma.apiKey.delete({ where: { id } });
}

/**
 * Validate an API key from request header. Returns workspace info if valid.
 */
export async function validateApiKey(rawKey: string) {
  if (!rawKey.startsWith(KEY_PREFIX)) return null;

  const keyHash = hashKey(rawKey);
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { workspace: true },
  });

  if (!apiKey) return null;
  if (apiKey.active === false) return null;

  // Check expiration
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

  // Update lastUsedAt
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    keyId: apiKey.id,
    workspaceId: apiKey.workspace.id,
    workspaceSlug: apiKey.workspace.slug,
    scopes: apiKey.scopes,
    specIds: apiKey.specIds,
    rateLimitPerMin: apiKey.rateLimitPerMin,
    prefix: apiKey.prefix,
  };
}
