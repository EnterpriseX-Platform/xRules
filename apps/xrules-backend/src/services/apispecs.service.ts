// API Specs: an API has operations (method + path); each operation owns one flow (kind API).
import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { generateSlug } from '../utils/slug.js';
import { assertProjectAccess } from './_access.js';
import type { AuthUser } from '../middleware/auth.js';
import { invalidateArtifacts, runArtifact } from '../platform/runner.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const RESERVED = /^v\d+$|^(rules|flows|data|auth|health|metrics)$/;

const fmtOp = (o: any) => ({ id: o.id, specId: o.specId, method: o.method, path: o.path, summary: o.summary, requestSchema: o.requestSchema, responseSchema: o.responseSchema, flowId: o.flowId,
  flow: o.flow ? { id: o.flow.id, slug: o.flow.slug, status: o.flow.status.toLowerCase(), version: o.flow.version, nodes: (o.flow.graph?.nodes || []).length } : undefined });
const fmt = (s: any) => ({ id: s.id, name: s.name, slug: s.slug, basePath: s.basePath, version: s.version, description: s.description, status: s.status.toLowerCase(), revision: s.revision, reviewState: s.reviewState,
  projectId: s.projectId, url: `/api/${s.project?.workspace?.slug ? s.project.workspace.slug + '/' : ''}${s.basePath}/v${s.version}`, operations: s.operations?.map(fmtOp), createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() });

export async function list(projectIdOrSlug: string, user: AuthUser) {
  const p = await assertProjectAccess(projectIdOrSlug, user);
  const rows = await prisma.apiSpec.findMany({ where: { projectId: p.id }, include: { project: { select: { workspace: { select: { slug: true } } } }, operations: { include: { flow: true } } }, orderBy: { name: 'asc' } });
  return rows.map(fmt);
}

export async function get(id: string, user: AuthUser) {
  const s = await prisma.apiSpec.findUnique({ where: { id }, include: { project: { select: { workspace: { select: { slug: true } } } }, operations: { include: { flow: true }, orderBy: { path: 'asc' } } } });
  if (!s) throw new NotFoundError('API Spec');
  await assertProjectAccess(s.projectId, user);
  return fmt(s);
}

export async function create(data: { projectId: string; name: string; basePath?: string; version?: number; description?: string }, user: AuthUser) {
  if (!data.projectId || !data.name) throw new ValidationError('projectId and name required');
  const p = await assertProjectAccess(data.projectId, user, 'write');
  const basePath = generateSlug(data.basePath || data.name);
  if (!basePath || RESERVED.test(basePath)) throw new ValidationError(`basePath '${basePath}' is reserved or empty`);
  const version = Number(data.version || 1);
  if (await prisma.apiSpec.findUnique({ where: { workspaceId_basePath_version: { workspaceId: p.workspaceId, basePath, version } } })) throw new ValidationError(`/api/${basePath}/v${version} already exists`);
  let slug = generateSlug(data.name), n = 1;
  while (await prisma.apiSpec.findUnique({ where: { projectId_slug: { projectId: p.id, slug } } })) slug = `${generateSlug(data.name)}-${++n}`;
  const s = await prisma.apiSpec.create({ data: { projectId: p.id, workspaceId: p.workspaceId, name: data.name, slug, basePath, version, description: data.description }, include: { project: { select: { workspace: { select: { slug: true } } } }, operations: true } });
  return fmt(s);
}

export async function update(id: string, data: any, user: AuthUser) {
  const s = await prisma.apiSpec.findUnique({ where: { id } });
  if (!s) throw new NotFoundError('API Spec');
  await assertProjectAccess(s.projectId, user, 'write');
  const u: any = {};
  for (const k of ['name', 'description']) if (data[k] !== undefined) u[k] = data[k];
  return fmt(await prisma.apiSpec.update({ where: { id }, data: { ...u, status: 'DRAFT' }, include: { project: { select: { workspace: { select: { slug: true } } } }, operations: { include: { flow: true } } } }));
}

export async function remove(id: string, user: AuthUser) {
  const s = await prisma.apiSpec.findUnique({ where: { id }, include: { operations: true } });
  if (!s) throw new NotFoundError('API Spec');
  await assertProjectAccess(s.projectId, user, 'write');
  await prisma.$transaction([prisma.apiSpec.delete({ where: { id } }), prisma.flow.deleteMany({ where: { id: { in: s.operations.map(o => o.flowId) } } })]);
  invalidateArtifacts();
}

function normPath(p: string) { const x = ('/' + String(p || '').trim()).replace(/\/+/g, '/').replace(/\/$/, ''); return x || '/'; }

export async function addOperation(specId: string, data: { method: string; path: string; summary?: string; requestSchema?: any; responseSchema?: any }, user: AuthUser) {
  const s = await prisma.apiSpec.findUnique({ where: { id: specId } });
  if (!s) throw new NotFoundError('API Spec');
  await assertProjectAccess(s.projectId, user, 'write');
  const method = String(data.method || 'POST').toUpperCase();
  if (!METHODS.includes(method)) throw new ValidationError(`method must be one of ${METHODS.join(', ')}`);
  const path = normPath(data.path);
  if (await prisma.apiOperation.findUnique({ where: { specId_method_path: { specId, method, path } } })) throw new ValidationError(`${method} ${path} already exists`);
  const slugBase = generateSlug(`${s.slug}-${method}-${path}`) || `${s.slug}-op`;
  let slug = slugBase, n = 1;
  while (await prisma.flow.findUnique({ where: { projectId_slug: { projectId: s.projectId, slug } } })) slug = `${slugBase}-${++n}`;
  const flow = await prisma.flow.create({ data: {
    projectId: s.projectId, name: `${method} ${path}`, slug, kind: 'API',
    graph: { nodes: [
      { id: 'in', type: 'apiInput', position: { x: 40, y: 60 }, data: { label: `${method} ${path}` } },
      { id: 'out', type: 'apiResponse', position: { x: 640, y: 60 }, data: { label: 'API Response', status: 200, body: '{{input.body}}' } }],
      edges: [{ id: 'e1', source: 'in', target: 'out' }] },
  } });
  const op = await prisma.apiOperation.create({ data: { specId, method, path, summary: data.summary, requestSchema: data.requestSchema, responseSchema: data.responseSchema, flowId: flow.id }, include: { flow: true } });
  await prisma.apiSpec.update({ where: { id: specId }, data: { status: 'DRAFT' } });
  return fmtOp(op);
}

export async function updateOperation(opId: string, data: any, user: AuthUser) {
  const op = await prisma.apiOperation.findUnique({ where: { id: opId }, include: { spec: true } });
  if (!op) throw new NotFoundError('Operation');
  await assertProjectAccess(op.spec.projectId, user, 'write');
  const u: any = {};
  if (data.method) u.method = String(data.method).toUpperCase();
  if (data.path) u.path = normPath(data.path);
  for (const k of ['summary', 'requestSchema', 'responseSchema']) if (data[k] !== undefined) u[k] = data[k];
  const r = await prisma.apiOperation.update({ where: { id: opId }, data: u, include: { flow: true } });
  await prisma.apiSpec.update({ where: { id: op.specId }, data: { status: 'DRAFT' } });
  return fmtOp(r);
}

export async function removeOperation(opId: string, user: AuthUser) {
  const op = await prisma.apiOperation.findUnique({ where: { id: opId }, include: { spec: true } });
  if (!op) throw new NotFoundError('Operation');
  await assertProjectAccess(op.spec.projectId, user, 'write');
  await prisma.flow.delete({ where: { id: op.flowId } });
  invalidateArtifacts();
}

/** Publish: every operation flow gets a published version; the spec becomes live. */
export async function publish(specId: string, user: AuthUser, message?: string) {
  const s = await prisma.apiSpec.findUnique({ where: { id: specId }, include: { project: { select: { workspace: { select: { slug: true } } } }, operations: { include: { flow: true } } } });
  if (!s) throw new NotFoundError('API Spec');
  await assertProjectAccess(s.projectId, user, 'write');
  if (!s.operations.length) throw new ValidationError('Add at least one operation before publishing');
  const { assertPublishable } = await import('./governance.service.js');
  await assertPublishable(s.projectId, 'api_spec', s.id, user);
  for (const op of s.operations) {
    const f = op.flow;
    const last = await prisma.flowVersion.findFirst({ where: { flowId: f.id, status: 'PUBLISHED' }, orderBy: { version: 'desc' } });
    if (last && JSON.stringify(last.graph) === JSON.stringify(f.graph)) continue;
    const v = f.version + 1;
    await prisma.$transaction([
      prisma.flowVersion.create({ data: { flowId: f.id, version: v, graph: f.graph as any, status: 'PUBLISHED', message } }),
      prisma.flow.update({ where: { id: f.id }, data: { version: v, status: 'PUBLISHED' } }),
    ]);
  }
  invalidateArtifacts();
  return fmt(await prisma.apiSpec.update({ where: { id: specId }, data: { status: 'PUBLISHED', revision: s.revision + 1, reviewState: 'NONE' }, include: { project: { select: { workspace: { select: { slug: true } } } }, operations: { include: { flow: true } } } }));
}

/** Try an operation against its draft flow — used by the Studio "Try it" panel. */
export async function tryOperation(opId: string, req: { params?: any; query?: any; body?: any; headers?: any }, user: AuthUser) {
  const op = await prisma.apiOperation.findUnique({ where: { id: opId }, include: { spec: true } });
  if (!op) throw new NotFoundError('Operation');
  await assertProjectAccess(op.spec.projectId, user);
  const r = await runArtifact(op.spec.projectId, op.flowId, { params: req.params || {}, query: req.query || {}, body: req.body ?? {}, headers: req.headers || {} },
    { draft: true, record: { targetType: 'test', operationId: op.id, forceTrace: true } });
  const resp = r.output?.__apiResponse ? r.output : { status: r.error ? 500 : 200, body: r.error ? { error: r.error } : r.output };
  return { status: resp.status, body: resp.body, ms: r.ms, trace: r.trace, executionId: r.executionId, error: r.error };
}

export async function openapi(specId: string) {
  const s = await prisma.apiSpec.findUnique({ where: { id: specId }, include: { project: { select: { workspace: { select: { slug: true } } } }, operations: true } });
  if (!s) throw new NotFoundError('API Spec');
  const paths: any = {};
  for (const op of s.operations) {
    const p = op.path.replace(/:(\w+)/g, '{$1}');
    const params = [...p.matchAll(/\{(\w+)\}/g)].map(m => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
    paths[p] = paths[p] || {};
    paths[p][op.method.toLowerCase()] = {
      summary: op.summary || `${op.method} ${op.path}`, operationId: op.id, parameters: params,
      ...(op.requestSchema && op.method !== 'GET' ? { requestBody: { required: true, content: { 'application/json': { schema: op.requestSchema } } } } : {}),
      responses: { 200: { description: 'OK', content: { 'application/json': { schema: op.responseSchema || { type: 'object' } } } }, 400: { description: 'Invalid request' }, 401: { description: 'Missing or invalid API key' }, 403: { description: 'Key may not call this API' }, 429: { description: 'Too many requests' } },
    };
  }
  return { openapi: '3.0.3', info: { title: s.name, version: `v${s.version}.${s.revision}`, description: s.description || '' },
    servers: [{ url: `/api/${s.project?.workspace?.slug ? s.project.workspace.slug + '/' : ''}${s.basePath}/v${s.version}` }], components: { securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' } } }, security: [{ apiKey: [] }], paths };
}
