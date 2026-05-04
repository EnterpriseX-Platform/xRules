import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { ValidationError, UnauthorizedError, NotFoundError, ForbiddenError } from '../utils/errors.js';
import { generateSlug } from '../utils/slug.js';
import type { AuthUser } from '../middleware/auth.js';

export async function signup(data: { email: string; password: string; name: string }) {
  if (!data.email || !data.password || !data.name) {
    throw new ValidationError('Email, password, and name are required');
  }

  if (data.password.length < 6) {
    throw new ValidationError('Password must be at least 6 characters');
  }

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new ValidationError('Email already registered');
  }

  const hashedPassword = await bcrypt.hash(data.password, 10);

  // Create user + default workspace in transaction
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: data.email,
        name: data.name,
        password: hashedPassword,
      },
    });

    // Create default workspace
    const baseSlug = generateSlug(data.name);
    let slug = baseSlug;
    let counter = 1;
    while (await tx.workspace.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const workspace = await tx.workspace.create({
      data: {
        name: `${data.name}'s Workspace`,
        slug,
        members: { create: { userId: user.id, role: 'OWNER' } },
      },
    });

    return { user, workspace };
  });

  // Generate tokens
  const tokenPayload = {
    userId: result.user.id,
    email: result.user.email,
    username: result.user.name || result.user.email,
    tenantId: result.workspace.slug,
    roles: ['OWNER'],
    iss: 'xrules-studio',
    aud: 'xrules-api',
  };

  const accessToken = jwt.sign(tokenPayload, env.jwtSecret, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ userId: result.user.id }, env.jwtRefreshSecret, { expiresIn: '7d' });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: 'OWNER',
      tenantId: result.workspace.slug,
    },
  };
}

export async function updateProfile(userId: string, data: { name?: string; email?: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');

  const updateData: any = {};
  if (data.name) updateData.name = data.name;
  if (data.email && data.email !== user.email) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new ValidationError('Email already in use');
    updateData.email = data.email;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updateData,
  });

  return { id: updated.id, email: updated.email, name: updated.name };
}

export async function changePassword(userId: string, data: { currentPassword: string; newPassword: string }) {
  if (!data.currentPassword || !data.newPassword) {
    throw new ValidationError('Current and new passwords are required');
  }
  if (data.newPassword.length < 6) {
    throw new ValidationError('New password must be at least 6 characters');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.password) throw new NotFoundError('User');

  const valid = await bcrypt.compare(data.currentPassword, user.password);
  if (!valid) throw new UnauthorizedError('Current password is incorrect');

  const hashed = await bcrypt.hash(data.newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
}

export async function listMembers(workspaceId: string, user: AuthUser) {
  const workspace = await prisma.workspace.findFirst({
    where: { OR: [{ id: workspaceId }, { slug: workspaceId }] },
  });
  if (!workspace) throw new NotFoundError('Workspace');

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: workspace.id, userId: user.userId },
  });
  if (!membership) throw new ForbiddenError('Access denied');

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return members.map(m => ({
    id: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    image: m.user.image,
    role: m.role,
    joinedAt: m.createdAt.toISOString(),
  }));
}

export async function updateMemberRole(workspaceId: string, memberId: string, role: string, user: AuthUser) {
  const workspace = await prisma.workspace.findFirst({
    where: { OR: [{ id: workspaceId }, { slug: workspaceId }] },
  });
  if (!workspace) throw new NotFoundError('Workspace');

  const myMembership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: workspace.id, userId: user.userId },
  });
  if (!myMembership || !['OWNER', 'ADMIN'].includes(myMembership.role)) {
    throw new ForbiddenError('Only OWNER/ADMIN can change roles');
  }

  const updated = await prisma.workspaceMember.update({
    where: { id: memberId },
    data: { role: role.toUpperCase() as any },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return { id: updated.id, userId: updated.userId, name: updated.user.name, email: updated.user.email, role: updated.role };
}

export async function removeMember(workspaceId: string, memberId: string, user: AuthUser) {
  const workspace = await prisma.workspace.findFirst({
    where: { OR: [{ id: workspaceId }, { slug: workspaceId }] },
  });
  if (!workspace) throw new NotFoundError('Workspace');

  const myMembership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: workspace.id, userId: user.userId },
  });
  if (!myMembership || !['OWNER', 'ADMIN'].includes(myMembership.role)) {
    throw new ForbiddenError('Only OWNER/ADMIN can remove members');
  }

  await prisma.workspaceMember.delete({ where: { id: memberId } });
}
