'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, Btn, Panel, Tabs, fmtTime, pct } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';
import { STATUS } from '../page';

const ROW: Record<string, [any, string]> = { PASSED: ['green', 'ผ่าน'], FAILED: ['orange', 'ไม่ผ่าน'], ERROR: ['red', 'ผิดพลาด'], PENDING: ['gray', 'รอ'] };

export default function BulkRunPage() {
  const { projectId, runId } = useParams<{ projectId: string; runId: string }>();
  const qc = useQueryClient();
  const [tab, setTab] = useState('ผลรายแถว');
  const [filter, setFilter] = useState('');
  const [other, setOther] = useState('');
  const { data: r } = useQuery({ queryKey: ['bulk-run', runId], queryFn: () => api.get<any>(`/platform/bulk/${runId}`), refetchInterval: q => (q.state.data && ['RUNNING', 'QUEUED'].includes((q.state.data as any).status) ? 1500 : false) });
  const { data: rows = [] } = useQuery({ queryKey: ['bulk-rows', runId, filter, r?.processed], queryFn: () => api.get<any[]>(`/platform/bulk/${runId}/rows?limit=200${filter ? `&status=${filter}` : ''}`) });
  const { data: runs = [] } = useQuery({ queryKey: ['bulk', projectId], queryFn: () => api.get<any[]>(`/platform/bulk?project_id=${projectId}`) });
  const { data: cmp } = useQuery({ queryKey: ['bulk-cmp', runId, other || r?.compareToId], queryFn: () => api.get<any>(`/platform/bulk/${runId}/compare/${other || r?.compareToId}`), enabled: !!(other || r?.compareToId) && tab === 'เทียบกับอีกรอบ' });
  const act = useMutation({ mutationFn: (a: string) => api.post(`/platform/bulk/${runId}/${a}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['bulk-run', runId] }) });
  const download = async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'}/platform/bulk/${runId}/results.csv`, { headers: { Authorization: `Bearer ${localStorage.getItem('xrules_token') || ''}` } });
    const url = URL.createObjectURL(await res.blob()); const a = document.createElement('a'); a.href = url; a.download = `bulk-${runId}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  if (!r) return <div className="px-8 py-6" />;
  const rate = r.startedAt && r.processed ? r.processed / ((Date.now() - new Date(r.finishedAt || Date.now()).getTime() + (new Date(r.finishedAt || Date.now()).getTime() - new Date(r.startedAt).getTime())) / 1000) : 0;
  const byRule = Object.entries(r.summary?.byRule || {}) as [string, any][];
  return (
    <div className="px-8 py-6">
      <PageHead title={r.name || `Bulk Run ${r.id.slice(0, 8)}`} sub={<>{r.targetType === 'rule' ? 'Rule' : 'Decision Flow'} {r.targetVersion ? `v${r.targetVersion}` : '(ร่าง)'} · เริ่ม {fmtTime(r.startedAt || r.createdAt)}{r.finishedAt && ` · เสร็จ ${fmtTime(r.finishedAt)}`}</>}
        actions={<>
          {r.status === 'RUNNING' && <Btn kind="tertiary" onClick={() => act.mutate('pause')}>พักไว้</Btn>}
          {r.status === 'PAUSED' && <Btn kind="tertiary" onClick={() => act.mutate('resume')}>รันต่อ</Btn>}
          {['RUNNING', 'PAUSED', 'QUEUED'].includes(r.status) && <Btn kind="ghost" onClick={() => act.mutate('cancel')}>ยกเลิก</Btn>}
          {r.errored > 0 && r.status === 'COMPLETED' && <Btn kind="tertiary" onClick={() => act.mutate('retry_errors')}>รันซ้ำแถวที่ผิดพลาด ({r.errored})</Btn>}
          <Btn onClick={download}>ดาวน์โหลดผล (CSV)</Btn>
        </>} />
      <Panel className="mb-4">
        <div className="flex items-center gap-6">
          <Tag tone={STATUS[r.status][0]}>{STATUS[r.status][1]}</Tag>
          <div className="flex-1"><div className="h-2 bg-[#e0e0e0]"><div className="h-2 bg-[#0f62fe]" style={{ width: `${pct(r.processed, r.total)}%` }} /></div></div>
          <span className="tabular-nums text-[14px]">{r.processed.toLocaleString()} / {r.total.toLocaleString()} แถว ({pct(r.processed, r.total)}%)</span>
          {rate > 0 && <span className="tabular-nums text-[14px] text-[#525252]">{rate.toFixed(1)} แถว/วินาที</span>}
        </div>
        <div className="mt-3 text-[14px] tabular-nums">ผ่าน <b>{r.passed.toLocaleString()}</b> · ไม่ผ่าน <b>{r.failed.toLocaleString()}</b> · ผิดพลาด <b>{r.errored.toLocaleString()}</b></div>
      </Panel>
      <Tabs tabs={['ผลรายแถว', 'สรุปตามกฎ', 'เทียบกับอีกรอบ']} value={tab} onChange={setTab} />
      {tab === 'ผลรายแถว' && <>
        <div className="w-60 mb-3"><Dropdown value={filter} onChange={setFilter} options={[{ value: '', label: 'ทุกแถว' }, { value: 'FAILED', label: 'ไม่ผ่าน' }, { value: 'ERROR', label: 'ผิดพลาด' }, { value: 'PASSED', label: 'ผ่าน' }]} /></div>
        <Table head={['#', 'ผล', 'findings / ข้อผิดพลาด', 'ms']}>
          {rows.map((x: any) => (
            <tr key={x.idx}><Td mono>{x.idx + 1}</Td><Td><Tag tone={ROW[x.status][0]}>{ROW[x.status][1]}</Tag></Td>
              <Td className="!whitespace-normal">{x.error ? <span className="text-[#a2191f] text-[13px]">{x.error}</span> : (x.output?.findings || []).map((f: any, i: number) => <span key={i} className="mr-2 text-[12px]"><b>{f.severity}</b> {f.ruleCode} {f.lineId ? `(${f.lineId})` : ''}</span>)}</Td>
              <Td mono>{x.ms}</Td></tr>
          ))}
        </Table>
      </>}
      {tab === 'สรุปตามกฎ' && (
        <Table head={['รหัสกฎ', 'ERROR', 'WARNING', 'SKIPPED']} empty={!byRule.length ? <div className="px-4 py-6 text-[14px] text-[#525252]">{r.status === 'COMPLETED' ? 'ไม่มี finding' : 'สรุปเมื่อรันเสร็จ'}</div> : null}>
          {byRule.map(([code, c]) => <tr key={code}><Td mono>{code}</Td><Td mono>{c.ERROR || 0}</Td><Td mono>{c.WARNING || 0}</Td><Td mono>{c.SKIPPED || 0}</Td></tr>)}
        </Table>
      )}
      {tab === 'เทียบกับอีกรอบ' && <>
        <div className="w-96 mb-3"><Dropdown value={other || r.compareToId || ''} onChange={setOther} options={runs.filter((x: any) => x.id !== runId).map((x: any) => ({ value: x.id, label: x.name || x.id.slice(0, 8), hint: fmtTime(x.createdAt) }))} placeholder="เลือกรอบที่จะเทียบ" /></div>
        {cmp && <>
          <div className="text-[14px] mb-3">ผลเปลี่ยน <b>{cmp.changed}</b> แถว · {Object.entries(cmp.counts).map(([k, v]) => `${k} ${v}`).join(' · ') || 'ไม่มี'}</div>
          <Table head={['#', 'ก่อน', 'ตอนนี้']}>{cmp.rows.slice(0, 200).map((x: any) => <tr key={x.idx}><Td mono>{x.idx + 1}</Td><Td><Tag tone={ROW[x.before][0]}>{ROW[x.before][1]}</Tag></Td><Td><Tag tone={ROW[x.now][0]}>{ROW[x.now][1]}</Tag></Td></tr>)}</Table>
        </>}
      </>}
    </div>
  );
}
