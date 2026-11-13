'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Panel, Tag, Notice, fmtTime } from '@/components/pipeline/ui';

export default function MonitorOverview() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: o } = useQuery({ queryKey: ['mon-ov', projectId], queryFn: () => api.get<any>(`/platform/monitor/overview?project_id=${projectId}`), refetchInterval: 15000 });
  const base = `/projects/${projectId}/monitor`;
  if (!o) return <div className="px-8 py-6" />;
  const diff = o.callsYesterday ? Math.round(((o.callsToday - o.callsYesterday) / o.callsYesterday) * 100) : null;
  const clean = !o.slowOrFailing.length && !o.staleData.length && !o.connectionsDown.length && !o.alerts.length;
  return (
    <div className="px-8 py-6">
      <PageHead title="Overview" sub={<>API calls: {o.callsToday.toLocaleString()} in 24 h{diff !== null && ` (${diff >= 0 ? '+' : ''}${diff}% vs previous day)`}{o.bulkRunning ? ` · Bulk runs in progress: ${o.bulkRunning}` : ''}</>} />
      {clean && <Notice kind="success">Nothing needs attention right now</Notice>}
      <div className="grid grid-cols-2 gap-4 mt-4">
        <Panel title="Open alerts" actions={<Link className="text-[14px] text-[#0f62fe]" href={`${base}/alerts`}>View all</Link>}>
          {o.alerts.length ? o.alerts.map((a: any) => <div key={a.id} className="py-2 border-b border-[#e0e0e0] last:border-0"><Tag tone="red">Firing</Tag> <b className="text-[14px]">{a.rule}</b><div className="text-[13px] text-[#525252]">{a.message} · since {fmtTime(a.startedAt)}</div></div>) : <div className="text-[14px] text-[#525252]">None</div>}
        </Panel>
        <Panel title="Slow or failing APIs (24 h)" actions={<Link className="text-[14px] text-[#0f62fe]" href={`${base}/traffic`}>View all</Link>}>
          {o.slowOrFailing.length ? o.slowOrFailing.map((x: any) => <div key={x.id} className="py-2 text-[14px] border-b border-[#e0e0e0] last:border-0"><span className="font-mono">{x.method} /api/{x.basePath}/v{x.version}{x.path}</span><div className="text-[13px] text-[#525252]">Errors {x.errors}/{x.calls} · p95 {Math.round(x.p95 || 0)} ms</div></div>) : <div className="text-[14px] text-[#525252]">None</div>}
        </Panel>
        <Panel title="Stale or failed reference data" actions={<Link className="text-[14px] text-[#0f62fe]" href={`${base}/data-health`}>View all</Link>}>
          {o.staleData.length ? o.staleData.map((d: any) => <div key={d.id} className="py-2 text-[14px] border-b border-[#e0e0e0] last:border-0"><span className="font-mono">{d.slug}</span> {d.stale && <Tag tone="orange">stale</Tag>}<div className="text-[13px] text-[#525252]">Age {d.ageHours} h · latest run {d.lastStatus?.toLowerCase()}</div></div>) : <div className="text-[14px] text-[#525252]">None</div>}
        </Panel>
        <Panel title="Unreachable connections">
          {o.connectionsDown.length ? o.connectionsDown.map((c: any) => <div key={c.id} className="py-2 text-[14px]"><span className="font-mono">{c.slug}</span><div className="text-[13px] text-[#a2191f]">{c.lastTest?.error}</div></div>) : <div className="text-[14px] text-[#525252]">None</div>}
        </Panel>
      </div>
    </div>
  );
}
