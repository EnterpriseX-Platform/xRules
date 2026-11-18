'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePerms } from '@/lib/perms';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, Btn, Input, Panel, Notice, DropZone, fmtTime } from '@/components/pipeline/ui';

export default function DataSetsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter(); const sp = useSearchParams();
  const perms = usePerms(); const qc = useQueryClient();
  const [open, setOpen] = useState(false); const [name, setName] = useState(''); const [keys, setKeys] = useState(''); const [file, setFile] = useState<File | null>(null);
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
      <PageHead title="Data Sets" sub="Reference and training data in snapshots · from Data Flows or uploaded files" actions={perms.integrate ? <Btn onClick={() => setOpen(o => !o)}>Upload file</Btn> : undefined} />
      {open && <Panel title="Upload Excel / CSV" className="mb-4">
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
