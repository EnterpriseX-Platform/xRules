import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error(`[Error] ${err.message}`, err.stack);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
}
