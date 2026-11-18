'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, Btn, Input, TextArea, Panel, Notice, fmtTime, Modal } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';
import { usePerms } from '@/lib/perms';
import { InputFields, ExpectationRows, inputFieldsOf, outputFieldsOf, flowFields } from '@/components/test/FieldsEditor';

const ST: Record<string, [any, string]> = { PASS: ['green', 'Passed'], FAIL: ['red', 'Failed'], ERROR: ['red', 'Error'], PENDING: ['gray', 'Not run'] };
const TT: Record<string, string> = { rule: 'Rule', decision_flow: 'Decision Flow', operation: 'API operation' };

export default function TestsPage() {
  const perms = usePerms();
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [suite, setSuite] = useState('');
  const [suiteName, setSuiteName] = useState('');
  const [f, setF] = useState<any>({ name: '', targetType: 'decision_flow', targetId: '', input: {}, expectations: [{ kind: 'equals', path: '', value: '' }], suiteIds: [] });
  const { data: cases = [] } = useQuery({ queryKey: ['tests', projectId, suite], queryFn: () => api.get<any[]>(`/platform/tests?project_id=${projectId}${suite ? `&suiteId=${suite}` : ''}`) });
  const { data: suites = [] } = useQuery({ queryKey: ['suites', projectId], queryFn: () => api.get<any[]>(`/platform/suites?project_id=${projectId}`) });
  const { data: flows = [] } = useQuery({ queryKey: ['flows-all', projectId], queryFn: () => api.get<any[]>(`/flows?project_id=${projectId}`) });
  const { data: specs = [] } = useQuery({ queryKey: ['specs', projectId], queryFn: () => api.get<any[]>(`/platform/specs?project_id=${projectId}`) });
  const { data: rules = [] } = useQuery({ queryKey: ['rules', projectId], queryFn: () => api.get<any>(`/rules?project_id=${projectId}`) });
  const ruleList: any[] = Array.isArray(rules) ? rules : (rules?.data || rules?.items || []);
  const targetOpts = f.targetType === 'rule' ? ruleList.map(r => ({ value: r.id, label: r.name }))
    : f.targetType === 'operation' ? (specs as any[]).flatMap(s => (s.operations || []).map((o: any) => ({ value: o.id, label: `${s.name}: ${o.method} ${o.path}` })))
    : (flows as any[]).filter(x => x.kind === 'decision').map(x => ({ value: x.id, label: x.name }));
  const target = f.targetType === 'rule' ? ruleList.find(r => r.id === f.targetId) : (flows as any[]).find(x => x.id === f.targetId);
  const tf = f.targetType === 'rule' ? { inputs: inputFieldsOf(target), outputs: outputFieldsOf(target) } : f.targetType === 'decision_flow' ? flowFields(target, ruleList) : { inputs: [], outputs: [] };
  const names: Record<string, string> = Object.fromEntries([...targetOpts, ...(flows as any[]).map(x => ({ value: x.id, label: x.name })), ...ruleList.map(r => ({ value: r.id, label: r.name }))].map(o => [o.value, o.label]));
  const inv = () => qc.invalidateQueries({ queryKey: ['tests', projectId] });
  const run = useMutation({ meta: { failLabel: "Couldn't run" }, mutationFn: (id: string) => api.post(`/platform/tests/${id}/run`), onSettled: inv });
  const runSuite = useMutation({ meta: { failLabel: "Couldn't run" }, mutationFn: () => api.post(`/platform/suites/${suite}/run`), onSettled: inv });
  const newSuite = useMutation({ mutationFn: (name: string) => api.post<any>('/platform/suites', { projectId, name }), onSuccess: s => { qc.invalidateQueries({ queryKey: ['suites', projectId] }); setSuite(s.id); } });
  const create = useMutation({ meta: { silent: true }, mutationFn: () => api.post('/platform/tests', { projectId, name: f.name, targetType: f.targetType, targetId: f.targetId, input: f.input, expectations: f.expectations, suiteIds: suite ? [suite] : [] }), onSuccess: () => { setOpen(false); inv(); } });
  const passed = (cases as any[]).filter(c => c.lastStatus === 'PASS').length;
  return (
    <div className="px-8 py-6">
      <PageHead title="Test Suites" sub={`${cases.length} cases · ${passed} passed · all cases of an item must pass before it can be published`} actions={<>
        {suite && <Btn kind="tertiary" onClick={() => runSuite.mutate()} disabled={runSuite.isPending}>Run suite</Btn>}
        {perms.write && <Btn onClick={() => setOpen(true)}>New Test Case</Btn>}</>} />
      <div className="flex gap-2 items-end mb-4">
        <div className="w-80"><div className="text-[12px] text-[#525252] mb-1.5">Test suite</div><Dropdown value={suite} onChange={setSuite} options={[{ value: '', label: 'All cases' }, ...(suites as any[]).map(s => ({ value: s.id, label: s.name }))]} /></div>
        <Input id="suite-new" className="w-64" label="New suite" value={suiteName} onChange={setSuiteName} placeholder="TOR 4.4" />
        {perms.write && <Btn kind="ghost" onClick={() => { newSuite.mutate(suiteName); setSuiteName(''); }} disabled={!suiteName.trim()}>Create suite</Btn>}
      </div>
      {open && (
        <Modal title="New test case" onClose={() => setOpen(false)} wide onSubmit={() => create.mutate()} submitLabel="Save" submitDisabled={!f.name || !f.targetId || create.isPending} error={create.error ? String((create.error as any).message) : null}>
          <div className="grid gap-4">
            <Input id="tc-name" label="Name" value={f.name} onChange={(v: string) => setF({ ...f, name: v })} />
            <div><div className="text-[12px] text-[#525252] mb-1.5">Target type</div><Dropdown value={f.targetType} onChange={v => setF({ ...f, targetType: v, targetId: '' })} options={Object.entries(TT).map(([value, label]) => ({ value, label }))} /></div>
            <div><div className="text-[12px] text-[#525252] mb-1.5">Target</div><Dropdown value={f.targetId} onChange={v => setF({ ...f, targetId: v })} options={targetOpts} /></div>
          </div>
          <InputFields key={`in-${f.targetId}`} title={f.targetType === 'operation' ? 'Request' : 'Input'} fields={tf.inputs} value={f.input} onChange={v => setF({ ...f, input: v })} />
          <ExpectationRows key={`ex-${f.targetId}`} outputs={tf.outputs} value={f.expectations} onChange={v => setF({ ...f, expectations: v })} />
        </Modal>
      )}
      <Table head={['Case', 'Target', 'Last result', 'Details', '']} empty={!cases.length ? <div className="px-4 py-6 text-[14px] text-[#525252]">No test cases yet</div> : null}>
        {(cases as any[]).map(c => (
          <tr key={c.id}>
            <Td><span className="font-semibold">{c.name}</span></Td>
            <Td>{TT[c.targetType]}: {names[c.targetId] || c.targetId?.slice(0, 8)}</Td>
            <Td><Tag tone={ST[c.lastStatus][0]}>{ST[c.lastStatus][1]}</Tag>{c.lastResult?.at && <span className="text-[12px] text-[#525252] ml-2">{fmtTime(c.lastResult.at)}</span>}</Td>
            <Td className="!whitespace-normal text-[12px]">{(c.lastResult?.checks || []).map((x: any, i: number) => <div key={i} className={x.ok ? '' : 'text-[#a2191f]'}>{x.ok ? '✓' : '✗'} {x.message}</div>)}</Td>
            <Td><button className="h-8 px-3 text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={() => run.mutate(c.id)}>Run</button></Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
