import crypto from 'node:crypto';
import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { generateSlug } from '../utils/slug.js';
import { assertProjectAccess } from './_access.js';
import type { AuthUser } from '../middleware/auth.js';

// AES-256-GCM with key from env. In production use KMS; here we use a single key for simplicity.
const KEY = crypto.createHash('sha256').update(process.env.CONNECTION_ENC_KEY || 'dev-only-key-replace-in-production').digest();

function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

const fmt = (c: any, includeSecret = false) => ({
  id: c.id, name: c.name, slug: c.slug,
  type: c.type.toLowerCase(),
  meta: c.meta,
  config: includeSecret ? JSON.parse(decrypt(c.configEnc)) : undefined,
  projectId: c.projectId,
  createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
});

export async function list(projectId: string, user: AuthUser) {
  await assertProjectAccess(projectId, user);
  const rows = await prisma.connection.findMany({ where: { projectId }, orderBy: { updatedAt: 'desc' } });
  return rows.map(c => fmt(c));
}

export async function get(id: string, user: AuthUser, includeSecret = false) {
  const c = await prisma.connection.findUnique({ where: { id } });
  if (!c) throw new NotFoundError('Connection');
  await assertProjectAccess(c.projectId, user, includeSecret ? 'admin' : 'read');
  return fmt(c, includeSecret);
}

export async function create(
  data: { name: string; projectId: string; type: string; config: any; meta?: any },
  user: AuthUser,
) {
  if (!data.name || !data.projectId || !data.type || !data.config) throw new ValidationError('name, projectId, type, config required');
  await assertProjectAccess(data.projectId, user, 'admin');
  const baseSlug = generateSlug(data.name);
  let slug = baseSlug, counter = 1;
  while (await prisma.connection.findUnique({ where: { projectId_slug: { projectId: data.projectId, slug } } })) {
    slug = `${baseSlug}-${counter}`; counter++;
  }
  const c = await prisma.connection.create({
    data: {
      name: data.name, slug,
      type: data.type.toUpperCase() as any,
      configEnc: encrypt(JSON.stringify(data.config)),
      meta: data.meta || {},
      projectId: data.projectId,
    },
  });
  return fmt(c);
}

export async function update(id: string, data: any, user: AuthUser) {
  const c = await prisma.connection.findUnique({ where: { id } });
  if (!c) throw new NotFoundError('Connection');
  await assertProjectAccess(c.projectId, user, 'admin');
  const u: any = {};
  if (data.name) u.name = data.name;
  if (data.meta !== undefined) u.meta = data.meta;
  if (data.config) u.configEnc = encrypt(JSON.stringify(data.config));
  return fmt(await prisma.connection.update({ where: { id }, data: u }));
}

export async function remove(id: string, user: AuthUser) {
  const c = await prisma.connection.findUnique({ where: { id } });
  if (!c) throw new NotFoundError('Connection');
  await assertProjectAccess(c.projectId, user, 'admin');
  await prisma.connection.delete({ where: { id } });
}
