'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Panel, Tag, Notice, fmtTime } from '@/components/pipeline/ui';

export default function MonitorOverview() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: o } = useQuery({ queryKey: ['mon-ov', projectId], queryFn: () => api.get<any>(`/platform/monitor/overview?project_id=${projectId}`), refetchInterval: 15000 });
  const base = `/p/${projectId}/monitor`;
  if (!o) return <div className="px-8 py-6" />;
  const diff = o.callsYesterday ? Math.round(((o.callsToday - o.callsYesterday) / o.callsYesterday) * 100) : null;
  const clean = !o.slowOrFailing.length && !o.staleData.length && !o.connectionsDown.length && !o.alerts.length;
  return (
    <div className="px-8 py-6">
      <PageHead title="Overview" />
      <div className="grid gap-px bg-[#e0e0e0] border border-[#e0e0e0] grid-cols-2 lg:grid-cols-4 mb-6">
        {([['REST API calls, 24 h', o.callsToday.toLocaleString('en-US'), diff === null ? 'No calls the day before' : `${diff >= 0 ? '+' : ''}${diff}% on the day before`, ],
          ['Open alerts', o.alerts.length, ''], ['Slow or failing APIs', o.slowOrFailing.length, ''], ['Stale data sets', o.staleData.length, o.bulkRunning ? `${o.bulkRunning} bulk run${o.bulkRunning === 1 ? '' : 's'} in progress` : '']] as [string, any, string][]).map(([k, v, sub]) => (
          <div key={k} className="bg-white p-4"><div className="text-[12px] text-[#525252]">{k}</div><div className="text-[28px] font-light tabular-nums mt-1">{v}</div>{sub && <div className="text-[12px] text-[#6f6f6f]">{sub}</div>}</div>
        ))}
      </div>
      {clean && <Notice kind="success">Nothing needs attention right now</Notice>}
      <div className="grid gap-4 mt-4 lg:grid-cols-2">
        <Panel title="Open alerts" actions={<Link className="text-[14px] text-[#0f62fe]" href={`${base}/alerts`}>View all</Link>}>
          {o.alerts.length ? o.alerts.map((a: any) => <div key={a.id} className="py-2 border-b border-[#e0e0e0] last:border-0"><Tag tone="red">Firing</Tag> <b className="text-[14px]">{a.rule}</b><div className="text-[13px] text-[#525252]">{a.message} · since {fmtTime(a.startedAt)}</div></div>) : <div className="text-[14px] text-[#525252]">None</div>}
        </Panel>
        <Panel title="Slow or failing APIs (24 h)" actions={<Link className="text-[14px] text-[#0f62fe]" href={`${base}/traffic`}>View all</Link>}>
          {o.slowOrFailing.length ? o.slowOrFailing.map((x: any) => <div key={x.id} className="py-2 text-[14px] border-b border-[#e0e0e0] last:border-0"><span className="font-mono">{x.method} /api/{x.basePath}/v{x.version}{x.path}</span><div className="text-[13px] text-[#525252]">{Number(x.errors).toLocaleString('en-US')} errors in {Number(x.calls).toLocaleString('en-US')} calls · 95% answered within {Math.round(x.p95 || 0).toLocaleString('en-US')} ms</div></div>) : <div className="text-[14px] text-[#525252]">None</div>}
        </Panel>
        <Panel title="Stale or failed reference data" actions={<Link className="text-[14px] text-[#0f62fe]" href={`${base}/data-health`}>View all</Link>}>
          {o.staleData.length ? o.staleData.map((d: any) => <div key={d.id} className="py-2 text-[14px] border-b border-[#e0e0e0] last:border-0"><span className="font-mono">{d.slug}</span> {d.stale && <Tag tone="orange">stale</Tag>}<div className="text-[13px] text-[#525252]">Updated {Number(d.ageHours) >= 48 ? `${Math.round(d.ageHours / 24)} days` : `${Math.round(d.ageHours)} hours`} ago · latest run {d.lastStatus?.toLowerCase()}</div></div>) : <div className="text-[14px] text-[#525252]">None</div>}
        </Panel>
        <Panel title="Unreachable connections">
          {o.connectionsDown.length ? o.connectionsDown.map((c: any) => <div key={c.id} className="py-2 text-[14px]"><span className="font-mono">{c.slug}</span><div className="text-[13px] text-[#a2191f]">{c.lastTest?.error}</div></div>) : <div className="text-[14px] text-[#525252]">None</div>}
        </Panel>
      </div>
    </div>
  );
}
