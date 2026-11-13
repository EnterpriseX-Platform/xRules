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
      <PageHead title="Overview" sub={<>เรียก API {o.callsToday.toLocaleString()} ครั้งใน 24 ชม.{diff !== null && ` (${diff >= 0 ? '+' : ''}${diff}% จากวันก่อน)`}{o.bulkRunning ? ` · Bulk Run กำลังรัน ${o.bulkRunning}` : ''}</>} />
      {clean && <Notice kind="success">ไม่มีเรื่องที่ต้องดูตอนนี้</Notice>}
      <div className="grid grid-cols-2 gap-4 mt-4">
        <Panel title="การแจ้งเตือนที่ยังเปิดอยู่" actions={<Link className="text-[14px] text-[#0f62fe]" href={`${base}/alerts`}>ทั้งหมด</Link>}>
          {o.alerts.length ? o.alerts.map((a: any) => <div key={a.id} className="py-2 border-b border-[#e0e0e0] last:border-0"><Tag tone="red">เปิดอยู่</Tag> <b className="text-[14px]">{a.rule}</b><div className="text-[13px] text-[#525252]">{a.message} · ตั้งแต่ {fmtTime(a.startedAt)}</div></div>) : <div className="text-[14px] text-[#525252]">ไม่มี</div>}
        </Panel>
        <Panel title="API ที่ช้าหรือผิดพลาด (24 ชม.)" actions={<Link className="text-[14px] text-[#0f62fe]" href={`${base}/traffic`}>ดูทั้งหมด</Link>}>
          {o.slowOrFailing.length ? o.slowOrFailing.map((x: any) => <div key={x.id} className="py-2 text-[14px] border-b border-[#e0e0e0] last:border-0"><span className="font-mono">{x.method} /api/{x.basePath}/v{x.version}{x.path}</span><div className="text-[13px] text-[#525252]">ผิดพลาด {x.errors}/{x.calls} · p95 {Math.round(x.p95 || 0)} ms</div></div>) : <div className="text-[14px] text-[#525252]">ไม่มี</div>}
        </Panel>
        <Panel title="ข้อมูลอ้างอิงที่เก่าหรือดึงไม่สำเร็จ" actions={<Link className="text-[14px] text-[#0f62fe]" href={`${base}/data-health`}>ดูทั้งหมด</Link>}>
          {o.staleData.length ? o.staleData.map((d: any) => <div key={d.id} className="py-2 text-[14px] border-b border-[#e0e0e0] last:border-0"><span className="font-mono">{d.slug}</span> {d.stale && <Tag tone="orange">stale</Tag>}<div className="text-[13px] text-[#525252]">อายุ {d.ageHours} ชม. · รอบล่าสุด {d.lastStatus?.toLowerCase()}</div></div>) : <div className="text-[14px] text-[#525252]">ไม่มี</div>}
        </Panel>
        <Panel title="Connection ที่ต่อไม่ได้">
          {o.connectionsDown.length ? o.connectionsDown.map((c: any) => <div key={c.id} className="py-2 text-[14px]"><span className="font-mono">{c.slug}</span><div className="text-[13px] text-[#a2191f]">{c.lastTest?.error}</div></div>) : <div className="text-[14px] text-[#525252]">ไม่มี</div>}
        </Panel>
      </div>
    </div>
  );
}
