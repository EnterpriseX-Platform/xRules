'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePerms } from '@/lib/perms';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, Btn, Input, TextArea, Panel, Notice, DropZone, fmtTime } from '@/components/pipeline/ui';
import { Select } from '@/components/ui/Select';

export default function DataSetsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter(); const sp = useSearchParams();
  const perms = usePerms(); const qc = useQueryClient();
  const [open, setOpen] = useState<'' | 'file' | 'sql'>(''); const [name, setName] = useState(''); const [keys, setKeys] = useState(''); const [file, setFile] = useState<File | null>(null);
  const upload = useMutation({
    mutationFn: async () => {
      const b64 = await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = bad; r.readAsDataURL(file!); });
      return api.post<any>('/data/datasets/upload', { projectId, name, fileName: file!.name, contentBase64: b64, keyFields: keys.split(',').map(k => k.trim()).filter(Boolean) });
    },
    onSuccess: (d: any) => { qc.invalidateQueries({ queryKey: ['data-sets', projectId] }); router.push(`/p/${projectId}/data-sets/${d.id}`); },
  });
  const { data: sets } = useQuery({ queryKey: ['data-sets', projectId], queryFn: () => api.get<any[]>(`/data/datasets?project_id=${projectId}`) });
  useEffect(() => { const s = sp.get('slug'); const hit = s && sets?.find(x => x.slug === s); if (hit) router.replace(`/p/${projectId}/data-sets/${hit.id}`); }, [sp, sets, projectId, router]);
  return (
    <div className="px-8 py-6">
      <PageHead title="Data Sets" actions={perms.integrate ? <div className="flex gap-2"><Btn kind="secondary" onClick={() => setOpen(o => o === 'sql' ? '' : 'sql')}>From SQL</Btn><Btn onClick={() => setOpen(o => o === 'file' ? '' : 'file')}>Upload file</Btn></div> : undefined} />
      {open === 'sql' && <SqlSourcePanel projectId={projectId} onCancel={() => setOpen('')} onCreated={(id) => { qc.invalidateQueries({ queryKey: ['data-sets', projectId] }); router.push(`/p/${projectId}/data-sets/${id}`); }} />}
      {open === 'file' && <Panel title="Upload Excel / CSV" className="mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Input id="ds-name" label="Data Set name" value={name} onChange={setName} placeholder="budget requests 2565-2568" />
          <Input id="ds-keys" label="Key columns (comma separated, optional)" mono value={keys} onChange={setKeys} placeholder="requestNo" />
        </div>
        <DropZone accept=".xlsx,.csv" onFile={setFile} label={file ? `${file.name} (${Math.round(file.size / 1024)} KB) — drop another file to replace` : 'Drop an Excel / CSV file here or click to choose'} />
        {upload.error && <div className="mt-3"><Notice kind="error">{(upload.error as any).message}</Notice></div>}
        <div className="mt-4"><Btn onClick={() => upload.mutate()} disabled={!name.trim() || !file || upload.isPending}>Upload</Btn></div>
      </Panel>}
      <Table head={['Data Set', 'Key', 'Rows', 'Active snapshot', 'Latest snapshot']}
        empty={sets && !sets.length ? <div className="px-4 py-8 text-[14px] text-[#525252]">No Data Sets yet. Create one with a Write Data Set step in a Data Flow</div> : null}>
        {(sets || []).map(d => (
          <tr key={d.id} className="hover:bg-[#e8e8e8] cursor-pointer" onClick={() => router.push(`/p/${projectId}/data-sets/${d.id}`)}>
            <Td><span className="font-semibold font-mono text-[13px]">{d.slug}</span></Td>
            <Td mono>{d.keyFields.join(' + ') || '—'}</Td>
            <Td mono>{d.rowCount.toLocaleString()}</Td>
            <Td>{d.active ? <span className="flex items-center gap-2">{fmtTime(d.active.at)}{d.stale && <Tag tone="orange">stale</Tag>}</span> : <Tag>None</Tag>}</Td>
            <Td>{d.latest ? <span className="flex items-center gap-2">{fmtTime(d.latest.at)}<Tag tone={d.latest.status === 'REJECTED' ? 'red' : d.latest.status === 'ACTIVE' ? 'green' : 'gray'}>{d.latest.status.toLowerCase()}</Tag></span> : '—'}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

/** Data Set from a read-only SQL query on an Oracle / PostgreSQL connection. The API allows one SELECT / WITH statement and caps rows and time. */
function SqlSourcePanel({ projectId, onCancel, onCreated }: { projectId: string; onCancel: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState(''); const [keys, setKeys] = useState(''); const [conn, setConn] = useState('');
  const [sql, setSql] = useState('SELECT *\nFROM ');
  const [limit, setLimit] = useState('50000'); const [timeoutSec, setTimeoutSec] = useState('60');
  const { data: conns = [] } = useQuery({ queryKey: ['connections', projectId], queryFn: () => api.get<any[]>(`/connections?project_id=${projectId}`) });
  const sqlConns = (conns as any[]).filter(c => ['ORACLE', 'POSTGRES'].includes(String(c.type).toUpperCase()));
  const body = () => ({ projectId, name, connectionId: conn, sql, limit: Number(limit) || undefined, timeoutSec: Number(timeoutSec) || undefined, keyFields: keys.split(',').map(k => k.trim()).filter(Boolean) });
  const preview = useMutation({ meta: { silent: true }, mutationFn: () => api.post<any>('/data/datasets/query', { ...body(), preview: true }) });
  const create = useMutation({ meta: { silent: true }, mutationFn: () => api.post<any>('/data/datasets/query', body()), onSuccess: (d: any) => onCreated(d.id) });
  const rows: any[] = preview.data?.rows || []; const cols: string[] = preview.data?.columns || [];
  const err = (create.error || preview.error) as any;
  return (
    <Panel title="Data Set from SQL" className="mb-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Input id="sq-name" label="Data Set name" value={name} onChange={setName} placeholder="requests by year" />
        <div>
          <label htmlFor="sq-conn" className="block text-[12px] text-[#525252] mb-1.5">Connection (Oracle / PostgreSQL)</label>
          <Select id="sq-conn" className="w-full" value={conn} onChange={e => setConn(e.target.value)}>
            <option value="">{sqlConns.length ? 'Choose a connection' : 'No Oracle / PostgreSQL connection yet'}</option>
            {sqlConns.map(c => <option key={c.id} value={c.id}>{c.name} · {String(c.type).toLowerCase()}</option>)}
          </Select>
        </div>
      </div>
      <TextArea id="sq-sql" label="Query (one SELECT or WITH statement, read-only)" rows={8} value={sql} onChange={setSql} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <Input id="sq-limit" label="Max rows" mono value={limit} onChange={setLimit} />
        <Input id="sq-timeout" label="Time limit (seconds)" mono value={timeoutSec} onChange={setTimeoutSec} />
        <Input id="sq-keys" label="Key columns (comma separated, optional)" mono value={keys} onChange={setKeys} />
      </div>
      {err && <div className="mt-3"><Notice kind="error">{err.message}</Notice></div>}
      {preview.data && <div className="mt-4">
        <div className="text-[13px] text-[#525252] mb-2">First {rows.length} rows · {preview.data.ms} ms</div>
        <div className="max-h-[320px] overflow-auto"><Table head={cols}>{rows.map((r, i) => <tr key={i}>{cols.map(c => <Td key={c} mono>{String(r[c] ?? '')}</Td>)}</tr>)}</Table></div>
      </div>}
      <div className="mt-4 flex justify-end gap-2">
        <Btn kind="ghost" onClick={onCancel}>Cancel</Btn>
        <Btn kind="secondary" onClick={() => preview.mutate()} disabled={!conn || !sql.trim() || preview.isPending}>Preview</Btn>
        <Btn onClick={() => create.mutate()} disabled={!name.trim() || !conn || !sql.trim() || create.isPending}>Create Data Set</Btn>
      </div>
    </Panel>
  );
}
