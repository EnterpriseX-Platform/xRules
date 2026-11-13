'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, Btn, Input, TextArea, Panel, Notice, fmtTime } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';

const ST: Record<string, [any, string]> = { PASS: ['green', 'ผ่าน'], FAIL: ['red', 'ไม่ผ่าน'], ERROR: ['red', 'ผิดพลาด'], PENDING: ['gray', 'ยังไม่รัน'] };
const TT: Record<string, string> = { rule: 'Rule', decision_flow: 'Decision Flow', operation: 'API operation' };

export default function TestsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [suite, setSuite] = useState('');
  const [suiteName, setSuiteName] = useState('');
  const [f, setF] = useState<any>({ name: '', targetType: 'decision_flow', targetId: '', input: '{\n  "context": {},\n  "items": []\n}', expectations: '[\n  { "kind": "has_finding", "code": "TOR-4.4.1.3", "severity": "WARNING" }\n]', suiteIds: [] });
  const { data: cases = [] } = useQuery({ queryKey: ['tests', projectId, suite], queryFn: () => api.get<any[]>(`/platform/tests?project_id=${projectId}${suite ? `&suiteId=${suite}` : ''}`) });
  const { data: suites = [] } = useQuery({ queryKey: ['suites', projectId], queryFn: () => api.get<any[]>(`/platform/suites?project_id=${projectId}`) });
  const { data: flows = [] } = useQuery({ queryKey: ['flows-all', projectId], queryFn: () => api.get<any[]>(`/flows?project_id=${projectId}`) });
  const { data: specs = [] } = useQuery({ queryKey: ['specs', projectId], queryFn: () => api.get<any[]>(`/platform/specs?project_id=${projectId}`) });
  const { data: rules = [] } = useQuery({ queryKey: ['rules', projectId], queryFn: () => api.get<any>(`/rules?project_id=${projectId}`) });
  const ruleList: any[] = Array.isArray(rules) ? rules : (rules?.data || rules?.items || []);
  const targetOpts = f.targetType === 'rule' ? ruleList.map(r => ({ value: r.id, label: r.name }))
    : f.targetType === 'operation' ? (specs as any[]).flatMap(s => (s.operations || []).map((o: any) => ({ value: o.id, label: `${s.name}: ${o.method} ${o.path}` })))
    : (flows as any[]).filter(x => x.kind === 'decision').map(x => ({ value: x.id, label: x.name }));
  const names: Record<string, string> = Object.fromEntries([...targetOpts, ...(flows as any[]).map(x => ({ value: x.id, label: x.name })), ...ruleList.map(r => ({ value: r.id, label: r.name }))].map(o => [o.value, o.label]));
  const inv = () => qc.invalidateQueries({ queryKey: ['tests', projectId] });
  const run = useMutation({ mutationFn: (id: string) => api.post(`/platform/tests/${id}/run`), onSettled: inv });
  const runSuite = useMutation({ mutationFn: () => api.post(`/platform/suites/${suite}/run`), onSettled: inv });
  const newSuite = useMutation({ mutationFn: (name: string) => api.post<any>('/platform/suites', { projectId, name }), onSuccess: s => { qc.invalidateQueries({ queryKey: ['suites', projectId] }); setSuite(s.id); } });
  const create = useMutation({ mutationFn: () => api.post('/platform/tests', { projectId, name: f.name, targetType: f.targetType, targetId: f.targetId, input: JSON.parse(f.input), expectations: JSON.parse(f.expectations), suiteIds: suite ? [suite] : [] }), onSuccess: () => { setOpen(false); inv(); } });
  const passed = (cases as any[]).filter(c => c.lastStatus === 'PASS').length;
  return (
    <div className="px-8 py-6">
      <PageHead title="Test Suites" sub={`${cases.length} กรณี · ผ่าน ${passed} · ทุกกรณีของสิ่งที่จะ publish ต้องผ่านก่อน`} actions={<>
        {suite && <Btn kind="tertiary" onClick={() => runSuite.mutate()} disabled={runSuite.isPending}>รันทั้งชุด</Btn>}
        <Btn onClick={() => setOpen(o => !o)}>New Test Case</Btn></>} />
      <div className="flex gap-2 items-end mb-4">
        <div className="w-80"><div className="text-[12px] text-[#525252] mb-1.5">ชุดทดสอบ</div><Dropdown value={suite} onChange={setSuite} options={[{ value: '', label: 'ทุกกรณี' }, ...(suites as any[]).map(s => ({ value: s.id, label: s.name }))]} /></div>
        <Input id="suite-new" className="w-64" label="ชุดใหม่" value={suiteName} onChange={setSuiteName} placeholder="TOR 4.4" />
        <Btn kind="ghost" onClick={() => { newSuite.mutate(suiteName); setSuiteName(''); }} disabled={!suiteName.trim()}>สร้างชุด</Btn>
      </div>
      {open && (
        <Panel title="กรณีทดสอบใหม่" className="mb-4">
          <div className="grid grid-cols-3 gap-4">
            <Input id="tc-name" label="ชื่อ" value={f.name} onChange={(v: string) => setF({ ...f, name: v })} />
            <div><div className="text-[12px] text-[#525252] mb-1.5">ทดสอบ</div><Dropdown value={f.targetType} onChange={v => setF({ ...f, targetType: v, targetId: '' })} options={Object.entries(TT).map(([value, label]) => ({ value, label }))} /></div>
            <div><div className="text-[12px] text-[#525252] mb-1.5">เป้าหมาย</div><Dropdown value={f.targetId} onChange={v => setF({ ...f, targetId: v })} options={targetOpts} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <TextArea id="tc-in" label={f.targetType === 'operation' ? 'คำขอ ({ "params", "query", "body" })' : 'ข้อมูลเข้า (JSON)'} rows={10} value={f.input} onChange={(v: string) => setF({ ...f, input: v })} />
            <TextArea id="tc-exp" label="ผลที่คาด: status · equals (path, value) · has_finding / no_finding (code, severity) · max_ms" rows={10} value={f.expectations} onChange={(v: string) => setF({ ...f, expectations: v })} />
          </div>
          {create.error && <div className="mt-3"><Notice kind="error">{String((create.error as any).message)}</Notice></div>}
          <div className="mt-4"><Btn onClick={() => create.mutate()} disabled={!f.name || !f.targetId || create.isPending}>บันทึก</Btn></div>
        </Panel>
      )}
      <Table head={['กรณี', 'ทดสอบ', 'ผลล่าสุด', 'รายละเอียด', '']} empty={!cases.length ? <div className="px-4 py-6 text-[14px] text-[#525252]">ยังไม่มีกรณีทดสอบ</div> : null}>
        {(cases as any[]).map(c => (
          <tr key={c.id}>
            <Td><span className="font-semibold">{c.name}</span></Td>
            <Td>{TT[c.targetType]}: {names[c.targetId] || c.targetId?.slice(0, 8)}</Td>
            <Td><Tag tone={ST[c.lastStatus][0]}>{ST[c.lastStatus][1]}</Tag>{c.lastResult?.at && <span className="text-[12px] text-[#525252] ml-2">{fmtTime(c.lastResult.at)}</span>}</Td>
            <Td className="!whitespace-normal text-[12px]">{(c.lastResult?.checks || []).map((x: any, i: number) => <div key={i} className={x.ok ? '' : 'text-[#a2191f]'}>{x.ok ? '✓' : '✗'} {x.message}</div>)}</Td>
            <Td><button className="h-8 px-3 text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={() => run.mutate(c.id)}>รัน</button></Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
