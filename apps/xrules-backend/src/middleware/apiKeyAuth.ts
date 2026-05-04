import { Request, Response, NextFunction } from 'express';
import { validateApiKey } from '../services/apikeys.service.js';

export interface ApiKeyUser {
  keyId: string;
  workspaceId: string;
  workspaceSlug: string;
  scopes: string[];
}

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKeyUser;
    }
  }
}

/**
 * Middleware that authenticates via X-API-Key header.
 * Sets req.apiKey if valid.
 */
export async function apiKeyAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;

  if (!apiKeyHeader) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'X-API-Key header is required' },
    });
    return;
  }

  try {
    const result = await validateApiKey(apiKeyHeader);
    if (!result) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_API_KEY', message: 'Invalid or expired API key' },
      });
      return;
    }

    req.apiKey = result;
    next();
  } catch {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'API key validation failed' },
    });
  }
}
