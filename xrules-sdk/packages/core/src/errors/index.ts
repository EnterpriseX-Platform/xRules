export class XRulesError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'XRulesError';
    Object.setPrototypeOf(this, XRulesError.prototype);
  }
}

export class ValidationError extends XRulesError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends XRulesError {
  constructor(resource: string, id?: string) {
    super(
      `${resource}${id ? ` with id '${id}'` : ''} not found`,
      'NOT_FOUND',
      404
    );
    this.name = 'NotFoundError';
  }
}

export class AuthorizationError extends XRulesError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'AuthorizationError';
  }
}

export class PermissionError extends XRulesError {
  constructor(message: string = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'PermissionError';
  }
}

export class ConflictError extends XRulesError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
    this.name = 'ConflictError';
  }
}

export class ExecutionError extends XRulesError {
  constructor(
    message: string,
    public nodeId?: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'EXECUTION_ERROR', 500, details);
    this.name = 'ExecutionError';
  }
}
