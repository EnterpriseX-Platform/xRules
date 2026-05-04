import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface AuthUser {
  userId: string;
  email: string;
  tenantId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'No token provided' },
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthUser;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
    });
  }
}

const DEMO_TENANT = 'demo';

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      req.user = jwt.verify(token, env.jwtSecret) as AuthUser;
    } catch {
      // Token invalid but we allow unauthenticated access for demo
    }
  }

  next();
}

export function isDemoRequest(req: Request): boolean {
  const workspace = req.query.workspace as string | undefined;
  return workspace === DEMO_TENANT;
}
