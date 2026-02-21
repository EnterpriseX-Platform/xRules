import { z } from 'zod';

// Workspace validators
export const workspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  status: z.enum(['active', 'suspended', 'deleted']),
});

// Project validators
export const projectSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  status: z.enum(['active', 'archived', 'deleted']),
});

// Rule validators
export const ruleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  projectId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  type: z.enum(['decision-table', 'decision-tree', 'flow', 'script']),
  status: z.enum(['draft', 'active', 'deprecated', 'archived']),
});

// Execution validators
export const executionSchema = z.object({
  id: z.string().uuid(),
  ruleId: z.string().uuid(),
  input: z.record(z.unknown()),
});

// Integration validators
export const integrationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  type: z.enum(['webhook', 'rest-api', 'graphql', 'database', 'message-queue']),
  status: z.enum(['active', 'inactive', 'error']),
});

// Webhook config validator
export const webhookConfigSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  headers: z.record(z.string()).optional(),
  secret: z.string().optional(),
  timeout: z.number().min(1000).max(60000).optional(),
});
