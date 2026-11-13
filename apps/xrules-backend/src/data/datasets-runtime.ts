// Data Set snapshots: write, activate, keep/prune, and fast key lookups for rules.
import { prisma } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { keyOf } from './expr.js';

const CACHE_MAX = 50_000;
const cache = new Map<string, any>();
function cacheGet(k: string) { return cache.get(k); }
function cacheSet(k: string, v: any) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(k, v);
}

export async function findDataset(projectId: string, slug: string) {
  return prisma.dataset.findUnique({ where: { projectId_slug: { projectId, slug } } });
}

export async function ensureDataset(projectId: string, slug: string, keyFields?: string[]) {
  const d = await findDataset(projectId, slug);
  if (d) {
    if (keyFields?.length && JSON.stringify(d.keyFields) !== JSON.stringify(keyFields)) {
      return prisma.dataset.update({ where: { id: d.id }, data: { keyFields } });
    }
    return d;
  }
  return prisma.dataset.create({ data: { projectId, slug, name: slug, format: 'snapshot', keyFields: keyFields || [] } });
}

/** Store rows as a new VALIDATED snapshot (not yet active). */
export async function writeSnapshot(datasetId: string, jobId: string | null, rows: any[], keyFields: string[], piiFields: string[], report: any, rejected: number) {
  const snap = await prisma.datasetSnapshot.create({ data: { datasetId, jobId, status: 'RUNNING', qualityReport: report, rejectedCount: rejected } });
  const strip = new Set(piiFields.flatMap(f => [f, f.toUpperCase(), f.toLowerCase()]));
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000).map(r => {
      const data: any = {};
      for (const [k, v] of Object.entries(r)) if (!strip.has(k)) data[k] = v;
      return { snapshotId: snap.id, key: keyOf(r, keyFields), data };
    });
    await prisma.datasetRow.createMany({ data: chunk });
  }
  return prisma.datasetSnapshot.update({ where: { id: snap.id }, data: { status: 'VALIDATED', rowCount: rows.length } });
}

export async function rejectSnapshot(datasetId: string, jobId: string | null, report: any, rejected: number) {
  return prisma.datasetSnapshot.create({ data: { datasetId, jobId, status: 'REJECTED', qualityReport: report, rejectedCount: rejected } });
}

/** Make a snapshot the one rules read. The previous active one becomes KEPT; old ones beyond retention are deleted. */
export async function activate(datasetId: string, snapshotId: string) {
  const ds = await prisma.dataset.findUnique({ where: { id: datasetId } });
  if (!ds) throw new NotFoundError('Dataset');
  const snap = await prisma.datasetSnapshot.findUnique({ where: { id: snapshotId } });
  if (!snap || snap.datasetId !== datasetId) throw new NotFoundError('Snapshot');
  if (snap.status === 'REJECTED' || snap.status === 'RUNNING') throw new ValidationError(`Snapshot is ${snap.status.toLowerCase()} and cannot be activated`);
  await prisma.$transaction([
    prisma.datasetSnapshot.updateMany({ where: { datasetId, status: 'ACTIVE' }, data: { status: 'KEPT' } }),
    prisma.datasetSnapshot.update({ where: { id: snapshotId }, data: { status: 'ACTIVE', activatedAt: new Date() } }),
    prisma.dataset.update({ where: { id: datasetId }, data: { activeSnapshotId: snapshotId, rowCount: snap.rowCount } }),
  ]);
  const old = await prisma.datasetSnapshot.findMany({ where: { datasetId, status: { in: ['KEPT', 'REJECTED'] } }, orderBy: { createdAt: 'desc' }, skip: ds.retention, select: { id: true } });
  if (old.length) await prisma.datasetSnapshot.deleteMany({ where: { id: { in: old.map(o => o.id) } } });
}

export interface LookupResult { found: boolean; data?: any; snapshotId?: string; snapshotAt?: string; stale?: boolean }

/** Look a key up in the active snapshot of a Data Set. `stale` = the latest run failed, so an older snapshot is being used. */
export async function lookup(projectId: string, slug: string, key: string): Promise<LookupResult> {
  const ds = await findDataset(projectId, slug);
  if (!ds) throw new Error(`Data Set '${slug}' not found`);
  if (!ds.activeSnapshotId) throw new Error(`Data Set '${slug}' has no active snapshot`);
  const ck = `${ds.activeSnapshotId}|${key}`;
  let row = cacheGet(ck);
  if (row === undefined) {
    const r = await prisma.datasetRow.findFirst({ where: { snapshotId: ds.activeSnapshotId, key }, select: { data: true } });
    row = r ? r.data : null;
    cacheSet(ck, row);
  }
  const meta = await snapshotMeta(ds.id, ds.activeSnapshotId);
  return { found: row !== null, data: row ?? undefined, ...meta };
}

const metaCache = new Map<string, { at: number; v: { snapshotId: string; snapshotAt: string; stale: boolean } }>();
async function snapshotMeta(datasetId: string, snapshotId: string) {
  const c = metaCache.get(snapshotId);
  if (c && Date.now() - c.at < 30_000) return c.v;
  const [snap, latest] = await Promise.all([
    prisma.datasetSnapshot.findUnique({ where: { id: snapshotId }, select: { createdAt: true } }),
    prisma.datasetSnapshot.findFirst({ where: { datasetId }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true } }),
  ]);
  const v = { snapshotId, snapshotAt: snap!.createdAt.toISOString(), stale: !!latest && latest.id !== snapshotId && latest.status === 'REJECTED' };
  metaCache.set(snapshotId, { at: Date.now(), v });
  return v;
}

export async function listSnapshots(datasetId: string) {
  const rows = await prisma.datasetSnapshot.findMany({ where: { datasetId }, orderBy: { createdAt: 'desc' }, take: 100 });
  return rows.map(s => ({ ...s, createdAt: s.createdAt.toISOString(), activatedAt: s.activatedAt?.toISOString() }));
}

export async function previewRows(snapshotId: string, limit = 100) {
  const rows = await prisma.datasetRow.findMany({ where: { snapshotId }, take: limit, orderBy: { id: 'asc' }, select: { key: true, data: true } });
  return rows;
}
