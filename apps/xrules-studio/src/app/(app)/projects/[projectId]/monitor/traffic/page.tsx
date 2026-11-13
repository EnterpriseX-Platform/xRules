'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, Panel, pct } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';

function Bars({ series }: { series: any[] }) {
  const max = Math.max(1, ...series.map(s => s.calls));
  return (
    <div className="flex items-end gap-[2px] h-32">
      {series.map((s, i) => (
        <div key={i} className="flex-1 h-full flex flex-col justify-end" title={`${new Date(s.t).toLocaleString('en-GB')} · ${s.calls} calls · ${s.errors} errors · p95 ${Math.round(s.p95 || 0)} ms`}>
          <div className="bg-[#da1e28]" style={{ height: `${(s.errors / max) * 100}%` }} />
          <div className="bg-[#0f62fe]" style={{ height: `${((s.calls - s.errors) / max) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

export default function TrafficPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [hours, setHours] = useState('24');
  const { data: t } = useQuery({ queryKey: ['traffic', projectId, hours], queryFn: () => api.get<any>(`/platform/monitor/traffic?project_id=${projectId}&hours=${hours}`), refetchInterval: 30000 });
  return (
    <div className="px-8 py-6">
      <PageHead title="API Traffic" sub="Calls, error rate and response time by operation and calling system"
        actions={<div className="w-44"><Dropdown value={hours} onChange={setHours} options={[{ value: '1', label: '1 hour' }, { value: '24', label: '24 hours' }, { value: '168', label: '7 days' }, { value: '720', label: '30 days' }]} /></div>} />
      {t && <>
        <Panel title="Calls per hour" className="mb-4">{t.series.length ? <Bars series={t.series} /> : <div className="text-[14px] text-[#525252]">No calls yet</div>}
          <div className="mt-2 text-[12px] text-[#525252]"><span className="inline-block w-3 h-3 bg-[#0f62fe] mr-1 align-middle" />Succeeded <span className="inline-block w-3 h-3 bg-[#da1e28] mx-1 align-middle" />Errors</div></Panel>
        <Table head={['Operation', 'Calls', 'Errors', 'p50', 'p95', 'p99']}>
          {t.operations.map((o: any) => (
            <tr key={o.id}><Td><span className="font-mono text-[13px]"><b>{o.method}</b> /api/{o.basePath}/v{o.version}{o.path}</span><div className="text-[12px] text-[#525252]">{o.spec}</div></Td>
              <Td mono>{o.calls.toLocaleString()}</Td>
              <Td>{o.errors ? <Tag tone={pct(o.errors, o.calls) > 5 ? 'red' : 'orange'}>{pct(o.errors, o.calls)}%</Tag> : <span className="text-[#525252]">0</span>}</Td>
              <Td mono>{o.p50 != null ? Math.round(o.p50) : '—'}</Td><Td mono>{o.p95 != null ? Math.round(o.p95) : '—'}</Td><Td mono>{o.p99 != null ? Math.round(o.p99) : '—'}</Td></tr>
          ))}
        </Table>
        <h2 className="text-[20px] mt-8 mb-3">By calling system</h2>
        <Table head={['Key', 'System', 'Calls', 'Errors']}>
          {t.keys.map((k: any) => <tr key={k.id}><Td>{k.name} <span className="font-mono text-[12px] text-[#525252]">{k.prefix}</span></Td><Td>{k.systemName || '—'}</Td><Td mono>{k.calls.toLocaleString()}</Td><Td mono>{k.errors}</Td></tr>)}
        </Table>
      </>}
    </div>
  );
}
