import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../config/database.js';
import { UnauthorizedError, NotFoundError, ForbiddenError } from '../utils/errors.js';

export interface JWTPayload {
  userId: string;
  email: string;
  username: string;
  tenantId: string;
  roles: string[];
  iss: string;
  aud: string;
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      workspaces: {
        include: { workspace: true },
      },
    },
  });

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.password) {
    throw new UnauthorizedError('Account has no password set');
  }

  const passwordValid = await bcrypt.compare(password, user.password);
  if (!passwordValid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const defaultWorkspace = user.workspaces[0]?.workspace;
  if (!defaultWorkspace) {
    throw new ForbiddenError('User has no workspace assigned');
  }

  const role = user.workspaces[0]?.role || 'MEMBER';

  const tokenPayload: JWTPayload = {
    userId: user.id,
    email: user.email,
    username: user.name || user.email,
    tenantId: defaultWorkspace.slug,
    roles: [role],
    iss: 'xrules-studio',
    aud: 'xrules-api',
  };

  const accessToken = jwt.sign(tokenPayload, env.jwtSecret, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ userId: user.id }, env.jwtRefreshSecret, { expiresIn: '7d' });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role,
      tenantId: defaultWorkspace.slug,
    },
  };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      workspaces: {
        include: { workspace: true },
      },
    },
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  const defaultWorkspace = user.workspaces[0];

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    role: defaultWorkspace?.role || 'MEMBER',
    tenantId: defaultWorkspace?.workspace?.slug,
  };
}

export async function refreshAccessToken(refreshToken: string) {
  let payload: { userId: string };
  try {
    payload = jwt.verify(refreshToken, env.jwtRefreshSecret) as { userId: string };
  } catch {
    throw new UnauthorizedError('Invalid refresh token');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: {
      workspaces: {
        include: { workspace: true },
      },
    },
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  const defaultWorkspace = user.workspaces[0]?.workspace;
  const role = user.workspaces[0]?.role || 'MEMBER';

  const tokenPayload: JWTPayload = {
    userId: user.id,
    email: user.email,
    username: user.name || user.email,
    tenantId: defaultWorkspace?.slug || '',
    roles: [role],
    iss: 'xrules-studio',
    aud: 'xrules-api',
  };

  const accessToken = jwt.sign(tokenPayload, env.jwtSecret, { expiresIn: '15m' });

  return { access_token: accessToken };
}
