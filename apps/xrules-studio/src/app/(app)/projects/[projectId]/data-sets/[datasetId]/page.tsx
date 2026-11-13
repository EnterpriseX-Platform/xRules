'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, Btn, fmtTime } from '@/components/pipeline/ui';

const TABS = ['Snapshots', 'Preview', 'Lookup', 'Used by'] as const;
const STATUS: Record<string, any> = { ACTIVE: ['green', 'Active'], KEPT: ['gray', 'Kept'], REJECTED: ['red', 'Rejected'], VALIDATED: ['blue', 'Validated'], RUNNING: ['blue', 'Running'] };

export default function DataSetDetailPage() {
  const { projectId, datasetId } = useParams<{ projectId: string; datasetId: string }>();
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Snapshots');
  const { data } = useQuery({ queryKey: ['dataset-snaps', datasetId], queryFn: () => api.get<any>(`/data/datasets/${datasetId}/snapshots`) });
  const ds = data?.dataset; const snaps: any[] = data?.snapshots || [];
  const activate = useMutation({ mutationFn: (sid: string) => api.post(`/data/datasets/${datasetId}/snapshots/${sid}/activate`), onSuccess: () => qc.invalidateQueries({ queryKey: ['dataset-snaps', datasetId] }) });
  const active = snaps.find(s => s.status === 'ACTIVE');
  if (!ds) return <div className="px-8 py-6" />;
  return (
    <div className="px-8 py-6">
      <PageHead title={ds.slug} sub={<>Key <span className="font-mono">{ds.keyFields.join(' + ') || '—'}</span> · {ds.rowCount.toLocaleString()} rows · keeps {ds.retention} snapshots</>} />
      <div className="flex border-b border-[#e0e0e0] mb-4">
        {TABS.map(t => <button key={t} onClick={() => setTab(t)} className={`h-10 px-4 text-[14px] ${tab === t ? 'border-b-2 border-[#0f62fe] text-[#161616] font-semibold' : 'text-[#525252] hover:bg-[#e8e8e8]'}`}>{t}</button>)}
      </div>
      {tab === 'Snapshots' && (
        <Table head={['Snapshot', 'Rows', 'Rejected', 'Quality checks', 'Status', '']}>
          {snaps.map(s => (
            <tr key={s.id}>
              <Td mono>{fmtTime(s.createdAt)}</Td>
              <Td mono>{s.rowCount.toLocaleString()}</Td>
              <Td mono>{s.rejectedCount}</Td>
              <Td className="text-[13px] text-[#525252]">{s.qualityReport?.error ? <span className="text-[#a2191f]">{s.qualityReport.error}</span> : s.qualityReport?.byCheck ? Object.entries(s.qualityReport.byCheck).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'all passed' : '—'}</Td>
              <Td><Tag tone={(STATUS[s.status] || ['gray'])[0]}>{(STATUS[s.status] || [s.status])[1]}</Tag></Td>
              <Td>{['KEPT', 'VALIDATED'].includes(s.status) && <button className="h-8 px-3 text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={() => activate.mutate(s.id)}>Use this snapshot</button>}</Td>
            </tr>
          ))}
        </Table>
      )}
      {tab === 'Preview' && <PreviewTab datasetId={datasetId} snapshotId={active?.id} />}
      {tab === 'Lookup' && <LookupTab datasetId={datasetId} keyFields={ds.keyFields} />}
      {tab === 'Used by' && <UsedBy datasetId={datasetId} projectId={projectId} />}
    </div>
  );
}

function PreviewTab({ datasetId, snapshotId }: { datasetId: string; snapshotId?: string }) {
  const { data } = useQuery({ queryKey: ['ds-rows', snapshotId], queryFn: () => api.get<any[]>(`/data/datasets/${datasetId}/snapshots/${snapshotId}/rows?limit=100`), enabled: !!snapshotId });
  const rows = (data || []).map(r => r.data);
  const cols = Array.from(new Set(rows.flatMap((r: any) => Object.keys(r))));
  if (!snapshotId) return <div className="text-[14px] text-[#525252]">No active snapshot yet</div>;
  return <Table head={cols}>{rows.map((r: any, i: number) => <tr key={i}>{cols.map(c => <Td key={c} mono>{String(r[c] ?? '')}</Td>)}</tr>)}</Table>;
}

function LookupTab({ datasetId, keyFields }: { datasetId: string; keyFields: string[] }) {
  const [vals, setVals] = useState<string[]>(keyFields.map(() => ''));
  const look = useMutation({ mutationFn: () => api.get<any>(`/data/datasets/${datasetId}/lookup?key=${encodeURIComponent(vals.join('|'))}`) });
  return (
    <div className="bg-white p-4 max-w-2xl">
      <div className="flex gap-2 items-end">
        {keyFields.map((k, i) => (
          <div key={k} className="flex-1"><label htmlFor={`lk-${k}`} className="block text-[12px] text-[#525252] mb-1.5">{k}</label>
            <input id={`lk-${k}`} className="input w-full font-mono" value={vals[i]} onChange={e => setVals(v => v.map((x, j) => j === i ? e.target.value : x))} /></div>
        ))}
        <Btn onClick={() => look.mutate()} disabled={look.isPending}>Look up</Btn>
      </div>
      {look.data && (
        <div className="mt-4">
          {look.data.found ? <Tag tone="green">Found</Tag> : <Tag tone="red">Not found</Tag>}
          {look.data.stale && <span className="ml-2"><Tag tone="orange">stale</Tag></span>}
          <span className="ml-2 text-[12px] text-[#525252]">Snapshot {fmtTime(look.data.snapshotAt)}</span>
          {look.data.found && <pre className="mt-3 bg-[#f4f4f4] p-3 text-[13px] font-mono overflow-x-auto">{JSON.stringify(look.data.data, null, 2)}</pre>}
        </div>
      )}
      {look.error && <div className="mt-3 text-[14px] text-[#a2191f]">{String((look.error as any).message)}</div>}
    </div>
  );
}

function UsedBy({ datasetId, projectId }: { datasetId: string; projectId: string }) {
  const { data } = useQuery({ queryKey: ['ds-used', datasetId], queryFn: () => api.get<any[]>(`/data/datasets/${datasetId}/used-by`) });
  const href = (u: any) => u.type === 'rule' ? `/projects/${projectId}/rules/${u.id}` : u.type === 'data_flow' ? `/projects/${projectId}/data-flows/${u.id}` : `/projects/${projectId}/flows/${u.id}`;
  return (
    <Table head={['Type', 'Name']} empty={data && !data.length ? <div className="px-4 py-6 text-[14px] text-[#525252]">No rule or flow uses this Data Set yet</div> : null}>
      {(data || []).map(u => <tr key={u.id}><Td><Tag tone={u.type === 'data_flow' ? 'green' : 'blue'}>{u.type === 'rule' ? 'Rule' : u.type === 'data_flow' ? 'Data Flow' : 'Decision Flow'}</Tag></Td><Td><Link className="text-[#0f62fe] hover:underline" href={href(u)}>{u.name}</Link> <span className="font-mono text-[12px] text-[#525252]">{u.slug}</span></Td></tr>)}
    </Table>
  );
}
