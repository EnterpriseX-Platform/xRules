// Generate OpenAPI 3.1 spec for a single rule from its input/output JSON Schemas
import { prisma } from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';
import { assertProjectAccess } from './_access.js';
import type { AuthUser } from '../middleware/auth.js';

export async function ruleOpenapi(id: string, user?: AuthUser, baseUrl?: string, apiKey?: { workspaceId: string }) {
  const rule = await prisma.rule.findUnique({
    where: { id },
    include: { project: { include: { workspace: true } } },
  });
  if (!rule) throw new NotFoundError('Rule');
  if (user) await assertProjectAccess(rule.projectId, user);
  if (apiKey && rule.project.workspaceId !== apiKey.workspaceId) throw new NotFoundError('Rule');

  const inputSchema = rule.inputSchema || { type: 'object', additionalProperties: true };
  const outputSchema = rule.outputSchema || { type: 'object', additionalProperties: true };

  const url = baseUrl || 'http://localhost:4000';
  const slug = rule.slug;
  const ws = rule.project.workspace.slug;
  const proj = rule.project.slug;

  return {
    openapi: '3.1.0',
    info: {
      title: `${rule.name} — XRules`,
      version: String(rule.version),
      description: rule.description || `Decision rule (${rule.type.toLowerCase()}) — ${rule.engine}`,
    },
    servers: [{ url }],
    paths: {
      [`/api/v1/rules/${id}/execute`]: {
        post: {
          tags: [rule.project.name],
          summary: `Execute ${rule.name}`,
          security: [{ ApiKey: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', properties: { input: inputSchema } }, example: { input: {} } } },
          },
          responses: {
            200: {
              description: 'Success',
              content: { 'application/json': { schema: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  output: outputSchema,
                  duration_ms: { type: 'integer' },
                  version: { type: 'integer' },
                  timestamp: { type: 'string', format: 'date-time' },
                },
              } } },
            },
            400: { description: 'Input validation failed' },
            401: { description: 'Missing or invalid API key' },
            404: { description: 'Rule not found' },
          },
        },
      },
      [`/api/v1/rules/${id}/v/{version}/execute`]: {
        post: {
          tags: [rule.project.name],
          summary: `Execute ${rule.name} at a specific version`,
          parameters: [{ name: 'version', in: 'path', required: true, schema: { type: 'integer' } }],
          security: [{ ApiKey: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', properties: { input: inputSchema } } } },
          },
          responses: { 200: { description: 'Success' }, 404: { description: 'Version not found' } },
        },
      },
    },
    components: {
      securitySchemes: {
        ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
      schemas: {
        Input: inputSchema,
        Output: outputSchema,
      },
    },
    'x-xrules': {
      ruleId: rule.id,
      ruleSlug: slug,
      project: { id: rule.projectId, slug: proj },
      workspace: { slug: ws },
      type: rule.type.toLowerCase(),
      engine: rule.engine,
      status: rule.status.toLowerCase(),
      version: rule.version,
    },
  };
}
