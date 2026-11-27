'use client';
// Export / Import: the project's configuration as one versioned bundle (a zip of readable YAML, folder per kind,
// file per object — fits a Git repository — or one JSON file). Import shows what would change before it writes.
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, downloadFile, releasesApi } from '@/lib/api';
import { PageHead, Panel, Btn, DropZone, fileToBase64, fmtTime } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';
import { usePerms, useEnvironment } from '@/lib/perms';

const KIND_LABEL: Record<string, string> = { words: 'Words', valueSets: 'Value sets', reasonCodes: 'Reason codes', productSettings: 'Product settings', topics: 'Topics', rules: 'Rules', flows: 'Flows', apis: 'REST APIs', testCases: 'Test cases', connections: 'Connections' };
const PARTS = [
  { value: '', label: 'Everything' }, { value: 'decisions', label: 'Decisions' }, { value: 'data', label: 'Data & vocabulary' },
  { value: 'integration', label: 'Integration' }, { value: 'testing', label: 'Test cases' },
];
const CHANGE: Record<string, string> = { added: 'New', changed: 'Changed', conflict: 'Conflict', unchanged: 'Same', 'not imported': 'Not imported' };

export default function BundlesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const perms = usePerms(); const env = useEnvironment(); const qc = useQueryClient();
  const [scope, setScope] = useState('project');
  const [product, setProduct] = useState('');
  const [release, setRelease] = useState('');
  const [parts, setParts] = useState('');
  const [format, setFormat] = useState('zip');
  const [err, setErr] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ name: string; body: any } | null>(null);
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<string | null>(null);

  const { data: live } = useQuery({ queryKey: ['live-params', projectId], queryFn: () => api.get<any>(`/platform/live-params?project_id=${projectId}`) });
  const { data: releases = [] } = useQuery({ queryKey: ['releases', projectId], queryFn: () => releasesApi.list(projectId) });

  const exportNow = () => {
    setErr(null);
    const q = new URLSearchParams({ format });
    if (scope === 'release') q.set('release_id', release); else q.set('project_id', projectId);
    if (scope === 'product') q.set('product', product);
    if (parts) q.set('parts', parts);
    downloadFile(`/platform/ops/export?${q}`, `bundle.${format}`).catch(e => setErr(e.message));
  };

  const preview = useMutation({ meta: { silent: true }, mutationFn: (body: any) => api.post<any>('/platform/ops/preview', { projectId, ...body }), onSuccess: (p: any) => setKeep(new Set(p.rows.filter((r: any) => r.change === 'conflict').map((r: any) => `${r.kind}:${r.key}`))) });
  const apply = useMutation({ meta: { silent: true }, mutationFn: () => api.post<any>('/platform/ops/import', { projectId, ...upload!.body, skip: Array.from(keep) }),
    onSuccess: (r: any) => { setDone(`Imported ${r.applied.length} object${r.applied.length === 1 ? '' : 's'} as drafts`); setUpload(null); preview.reset(); qc.invalidateQueries(); } });

  const onFile = async (f: File) => {
    setDone(null); setErr(null);
    try {
      const body = /\.zip$/i.test(f.name) ? { zip: await fileToBase64(f) } : /\.ya?ml$/i.test(f.name) ? { bundle: await f.text() } : { bundle: JSON.parse(await f.text()) };
      setUpload({ name: f.name, body }); preview.mutate(body);
    } catch (e: any) { setErr(`${f.name}: ${e.message}`); }
  };

  const p = preview.data;
  const shown = (p?.rows || []).filter((r: any) => r.change !== 'unchanged');
  const canImport = (perms.admin || perms.integrate) && !env.production;

  return (
    <div className="px-8 py-6 max-w-[1300px]">
      <PageHead title="Export / Import" />
      {err && <div className="mb-3 text-[14px] text-[#da1e28]">{err}</div>}
      {done && <div className="mb-3 text-[14px] text-[#198038]">{done}</div>}

      <Panel title="Export" className="mb-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          <div><div className="text-[12px] text-[#525252] mb-1.5">What</div><Dropdown value={scope} onChange={setScope} options={[{ value: 'project', label: 'This project' }, { value: 'product', label: 'One product' }, { value: 'release', label: 'A release' }]} /></div>
          {scope === 'product' && <div><div className="text-[12px] text-[#525252] mb-1.5">Product</div><Dropdown value={product} onChange={setProduct} options={(live?.products || []).map((x: string) => ({ value: x, label: x }))} /></div>}
          {scope === 'release' && <div><div className="text-[12px] text-[#525252] mb-1.5">Release</div><Dropdown value={release} onChange={setRelease} options={(releases as any[]).filter(r => r.manifest?.full).map(r => ({ value: r.id, label: `${r.name} · ${fmtTime(r.createdAt)}` }))} /></div>}
          <div><div className="text-[12px] text-[#525252] mb-1.5">Parts</div><Dropdown value={parts} onChange={setParts} options={PARTS} /></div>
          <div><div className="text-[12px] text-[#525252] mb-1.5">Format</div><Dropdown value={format} onChange={setFormat} options={[{ value: 'zip', label: 'YAML files (zip)' }, { value: 'json', label: 'One JSON file' }]} /></div>
        </div>
        <Btn onClick={exportNow} disabled={(scope === 'product' && !product) || (scope === 'release' && !release)}>Export</Btn>
      </Panel>

      {canImport && (
        <Panel title="Import">
          {!upload && <DropZone onFile={onFile} accept=".zip,.json,.yaml,.yml" label="Drop a bundle (.zip, .json or .yaml) here or click to choose" />}
          {preview.error && <div className="mt-3 text-[14px] text-[#da1e28]">{String((preview.error as any).message)}</div>}
          {upload && p && (
            <>
              <div className="text-[14px] mb-3">
                <span className="font-semibold">{upload.name}</span> · from {p.source?.project || 'unknown'}{p.source?.environment ? ` (${p.source.environment})` : ''}{p.source?.release ? ` · release ${p.source.release}` : ''} · exported {fmtTime(p.exportedAt)}
                <div className="mt-1 text-[#525252]">{p.summary.added} new · {p.summary.changed} changed · {p.summary.conflict} conflicts · {p.summary.unchanged} the same{p.summary.notImported ? ` · ${p.summary.notImported} not imported` : ''}</div>
              </div>
              {shown.length > 0 && (
                <table className="w-full text-[14px] border-collapse mb-4">
                  <thead><tr className="bg-[#f4f4f4] text-[12px] font-semibold text-[#525252] text-left"><th className="px-4 h-10">What</th><th className="px-4">Name</th><th className="px-4">Change</th><th className="px-4">Keep mine</th></tr></thead>
                  <tbody>{shown.map((r: any) => { const k = `${r.kind}:${r.key}`; const can = r.change === 'changed' || r.change === 'conflict'; return (
                    <tr key={k} className="border-b border-[#e0e0e0]">
                      <td className="px-4 h-10">{KIND_LABEL[r.kind] || r.kind}</td>
                      <td className="px-4 font-mono text-[13px]">{r.key}</td>
                      <td className={`px-4 ${r.change === 'conflict' ? 'text-[#da1e28]' : r.change === 'added' ? 'text-[#198038]' : ''}`}>{CHANGE[r.change]}{r.fields?.length ? `: ${r.fields.join(', ')}` : ''}{r.note ? <div className="text-[12px] text-[#525252]">{r.note}</div> : null}</td>
                      <td className="px-4">{can && <input type="checkbox" className="h-4 w-4 accent-[#161616]" aria-label={`Keep mine ${r.key}`} checked={keep.has(k)} onChange={e => { const n = new Set(keep); e.target.checked ? n.add(k) : n.delete(k); setKeep(n); }} />}</td>
                    </tr>); })}</tbody>
                </table>
              )}
              {apply.error && <div className="mb-3 text-[14px] text-[#da1e28]">{String((apply.error as any).message)}</div>}
              <div className="flex gap-2">
                <Btn onClick={() => apply.mutate()} disabled={apply.isPending || !shown.some((r: any) => ['added', 'changed', 'conflict'].includes(r.change) && !keep.has(`${r.kind}:${r.key}`))}>{apply.isPending ? 'Importing' : 'Import as drafts'}</Btn>
                <Btn kind="secondary" onClick={() => { setUpload(null); preview.reset(); }}>Cancel</Btn>
              </div>
            </>
          )}
        </Panel>
      )}
    </div>
  );
}
