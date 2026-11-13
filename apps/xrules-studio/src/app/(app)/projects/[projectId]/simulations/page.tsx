'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, Btn, Input, Panel, Notice, fmtTime, pct } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';

export default function SimulationsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const { data: flows = [] } = useQuery({ queryKey: ['flows-all', projectId], queryFn: () => api.get<any[]>(`/flows?project_id=${projectId}`) });
  const decision = (flows as any[]).filter(f => f.kind === 'decision');
  const [flow, setFlow] = useState(''); const [limit, setLimit] = useState('1000'); const [rate, setRate] = useState('20'); const [until, setUntil] = useState('');
  const { data: runs = [] } = useQuery({ queryKey: ['bulk', projectId], queryFn: () => api.get<any[]>(`/platform/bulk?project_id=${projectId}`), refetchInterval: 3000 });
  const pairs = (runs as any[]).filter(r => r.compareToId);
  const { data: ch } = useQuery({ queryKey: ['challenger', flow], queryFn: () => api.get<any>(`/platform/flows/${flow}/challenger`), enabled: !!flow });
  const backtest = useMutation({ mutationFn: () => api.post<any>('/platform/simulations/backtest', { projectId, flow, limit: Number(limit) || 1000 }), onSuccess: () => qc.invalidateQueries({ queryKey: ['bulk', projectId] }) });
  const setCh = useMutation({ mutationFn: (off: boolean) => api.put(`/platform/flows/${flow}/challenger`, off ? { off: true } : { sampleRate: (Number(rate) || 20) / 100, until: until || null }), onSuccess: () => qc.invalidateQueries({ queryKey: ['challenger', flow] }) });
  const s = ch?.summary;
  return (
    <div className="px-8 py-6">
      <PageHead title="Simulations" sub="ดูว่าร่างใหม่จะให้ผลต่างจากตัวที่ใช้อยู่อย่างไร ก่อนเปิดใช้จริง" />
      <div className="w-96 mb-4"><div className="text-[12px] text-[#525252] mb-1.5">Decision Flow</div><Dropdown value={flow} onChange={setFlow} options={decision.map(f => ({ value: f.id, label: f.name, hint: `v${f.version}` }))} /></div>
      <div className="grid grid-cols-2 gap-4 items-start">
        <Panel title="จำลองย้อนหลัง">
          <div className="text-[14px] text-[#525252] mb-3">รันร่างและตัวที่ใช้อยู่กับคำขอจริงย้อนหลัง แล้วเทียบผลทีละรายการ</div>
          <Input id="bt-lim" label="จำนวนคำขอล่าสุด" mono value={limit} onChange={setLimit} />
          <div className="mt-4"><Btn onClick={() => backtest.mutate()} disabled={!flow || backtest.isPending}>เริ่มจำลอง</Btn></div>
          {backtest.error && <div className="mt-3"><Notice kind="error">{String((backtest.error as any).message)}</Notice></div>}
        </Panel>
        <Panel title="Champion / Challenger บนระบบจริง">
          <div className="text-[14px] text-[#525252] mb-3">รันร่างคู่กับตัวจริงบนคำขอจริงบางส่วน ตอบผู้เรียกด้วยผลของตัวจริงเสมอ</div>
          {ch?.challenger ? <Notice kind="info">กำลังเทียบ {Math.round(ch.challenger.sampleRate * 100)}% ของคำขอ{ch.challenger.until ? ` ถึง ${fmtTime(ch.challenger.until)}` : ''}</Notice> : null}
          <div className="grid grid-cols-2 gap-4 mt-3">
            <Input id="ch-rate" label="สัดส่วนคำขอ (%)" mono value={rate} onChange={setRate} />
            <Input id="ch-until" label="สิ้นสุด (วันที่)" type="date" value={until} onChange={setUntil} />
          </div>
          <div className="mt-4 flex gap-2">
            <Btn onClick={() => setCh.mutate(false)} disabled={!flow}>{ch?.challenger ? 'ปรับ' : 'เริ่มเทียบ'}</Btn>
            {ch?.challenger && <Btn kind="ghost" onClick={() => setCh.mutate(true)}>หยุด</Btn>}
          </div>
          {s && s.total > 0 && <div className="mt-4 text-[14px] tabular-nums">เทียบแล้ว {s.total.toLocaleString()} คำขอ · ผลตรงกัน <b>{pct(s.same, s.total)}%</b> · ต่างกัน <b>{s.different.toLocaleString()}</b></div>}
        </Panel>
      </div>
      <h2 className="text-[20px] mt-8 mb-3">ผลจำลองย้อนหลัง</h2>
      <Table head={['รอบ', 'สถานะ', 'ความคืบหน้า', '']} empty={!pairs.length ? <div className="px-4 py-6 text-[14px] text-[#525252]">ยังไม่มี</div> : null}>
        {pairs.map((r: any) => (
          <tr key={r.id}><Td>{r.name}</Td><Td><Tag tone={r.status === 'COMPLETED' ? 'green' : 'blue'}>{r.status === 'COMPLETED' ? 'เสร็จ' : 'กำลังรัน'}</Tag></Td>
            <Td mono>{r.processed}/{r.total}</Td><Td><Link className="text-[#0f62fe] hover:underline" href={`/projects/${projectId}/bulk/${r.id}`}>ดูผลต่าง</Link></Td></tr>
        ))}
      </Table>
    </div>
  );
}
