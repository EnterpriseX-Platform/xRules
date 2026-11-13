'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, Btn, Input, TextArea, Panel, Notice, Tabs, DropZone } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';

export default function VocabularyPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [tab, setTab] = useState('เขียนกฎ');
  return (
    <div className="px-8 py-6">
      <PageHead title="Vocabulary" sub="คำศัพท์ทางธุรกิจ และกฎที่เขียนเป็นประโยคภาษาไทย" />
      <Tabs tabs={['เขียนกฎ', 'Rule Cowork', 'คำศัพท์']} value={tab} onChange={setTab} />
      {tab === 'เขียนกฎ' && <Writer projectId={projectId} />}
      {tab === 'Rule Cowork' && <Cowork projectId={projectId} />}
      {tab === 'คำศัพท์' && <Terms projectId={projectId} />}
    </div>
  );
}

function Writer({ projectId }: { projectId: string }) {
  const [sentence, setSentence] = useState('ถ้า ประเภทงบ เป็น "ครุภัณฑ์" และ ราคาต่อหน่วย มากกว่า ราคามาตรฐาน แล้ว เตือน "ราคาต่อหน่วยสูงกว่าราคามาตรฐาน" ระดับ WARNING รหัส TOR-4.4.1.3');
  const [name, setName] = useState('');
  const { data: terms = [] } = useQuery({ queryKey: ['vocab', projectId], queryFn: () => api.get<any[]>(`/platform/vocabulary?project_id=${projectId}`) });
  const check = useMutation({ mutationFn: () => api.post<any>('/platform/vocabulary/check', { projectId, sentence }) });
  const save = useMutation({ mutationFn: () => api.post<any>('/platform/vocabulary/rules', { projectId, name, sentence }) });
  const insert = (w: string) => setSentence(s => `${s.trimEnd()} ${w} `);
  return (
    <div className="grid grid-cols-[1fr_300px] gap-4 items-start">
      <Panel title="ประโยคกฎ">
        <TextArea id="sent" rows={4} mono={false} value={sentence} onChange={(v: string) => { setSentence(v); check.reset(); }} />
        <div className="mt-2 flex flex-wrap gap-1">
          {['ถ้า', 'และ', 'หรือ', 'แล้ว', 'เป็น', 'ไม่เป็น', 'มากกว่า', 'น้อยกว่า', 'ไม่เกิน', 'ไม่น้อยกว่า', 'อยู่ใน', 'ว่าง', 'ไม่ว่าง', 'เตือน', 'ไม่ผ่าน', 'ระดับ ERROR', 'ระดับ WARNING', 'รหัส'].map(w =>
            <button key={w} className="h-7 px-2 text-[12px] bg-[#e0e0e0] hover:bg-[#c6c6c6]" onClick={() => insert(w)}>{w}</button>)}
        </div>
        <div className="mt-4 flex gap-2"><Btn kind="tertiary" onClick={() => check.mutate()} disabled={check.isPending}>ตรวจประโยค</Btn></div>
        {check.data && (check.data.ok ? <div className="mt-4 space-y-3">
          <Notice kind="success">ประโยคถูกต้อง · ระบบอ่านกลับได้ว่า: {check.data.canonical}</Notice>
          <details><summary className="text-[14px] text-[#0f62fe] cursor-pointer">ดูกฎที่สร้าง</summary><pre className="bg-[#f4f4f4] p-3 text-[12px] font-mono mt-2 overflow-auto">{check.data.source}</pre></details>
          <div className="grid grid-cols-[1fr_auto] gap-2 items-end"><Input id="rule-name" label="ชื่อกฎ" value={name} onChange={setName} placeholder="tor-4-4-1-3" /><Btn onClick={() => save.mutate()} disabled={!name || save.isPending}>บันทึกเป็นร่าง</Btn></div>
          {save.isSuccess && <Notice kind="success">บันทึกกฎ {save.data.slug} เป็นร่างแล้ว · ทดสอบและส่งตรวจก่อน publish</Notice>}
          {save.error && <Notice kind="error">{String((save.error as any).message)}</Notice>}
        </div> : <div className="mt-4 space-y-2">{check.data.errors.map((e: any, i: number) => <Notice key={i} kind="error">{e.message}{e.suggestions?.length ? <div className="mt-1 flex flex-wrap gap-1">{e.suggestions.map((s: string) => <button key={s} className="h-6 px-2 text-[12px] bg-white border border-[#c6c6c6]" onClick={() => insert(s)}>{s}</button>)}</div> : null}</Notice>)}</div>)}
      </Panel>
      <Panel title="คำที่ใช้ได้">
        <div className="space-y-1">{(terms as any[]).map(t => <button key={t.id} className="w-full text-left h-8 px-2 hover:bg-[#e8e8e8] text-[14px] flex justify-between" onClick={() => insert(t.term)}><span>{t.term}</span><span className="font-mono text-[11px] text-[#6f6f6f]">{t.type}</span></button>)}</div>
      </Panel>
    </div>
  );
}

function Cowork({ projectId }: { projectId: string }) {
  const [text, setText] = useState('');
  const [flow, setFlow] = useState('');
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const { data: flows = [] } = useQuery({ queryKey: ['flows-all', projectId], queryFn: () => api.get<any[]>(`/flows?project_id=${projectId}`) });
  const draft = useMutation({ mutationFn: () => api.post<any>('/platform/cowork/draft', { projectId, text }), onSuccess: d => setPick(Object.fromEntries([...d.rules.map((r: any, i: number) => [`r${i}`, r.ok]), ...d.tests.map((_: any, i: number) => [`t${i}`, true]), ...d.newTerms.map((_: any, i: number) => [`n${i}`, true])])) });
  const apply = useMutation({ mutationFn: () => api.post<any>('/platform/cowork/apply', { projectId, flow: flow || undefined,
    newTerms: draft.data.newTerms.filter((_: any, i: number) => pick[`n${i}`]), rules: draft.data.rules.filter((_: any, i: number) => pick[`r${i}`]), tests: draft.data.tests.filter((_: any, i: number) => pick[`t${i}`]) }) });
  const d = draft.data;
  const onFile = async (f: File) => setText(await f.text());
  return (
    <div className="space-y-4">
      <Panel title="เล่าเงื่อนไข หรือวางเอกสาร">
        <TextArea id="cw-text" rows={8} mono={false} value={text} onChange={setText} />
        <div className="mt-3"><DropZone accept=".txt,.md,.csv" onFile={onFile} label="หรือลากไฟล์ข้อความ (.txt / .md) มาวาง" /></div>
        <div className="mt-4 flex gap-2 items-center"><Btn onClick={() => draft.mutate()} disabled={!text.trim() || draft.isPending}>{draft.isPending ? 'AI กำลังร่าง' : 'ให้ AI ร่างกฎ'}</Btn></div>
        {draft.error && <div className="mt-3"><Notice kind="error">{String((draft.error as any).message)}</Notice></div>}
      </Panel>
      {d && <>
        {d.questions.length > 0 && <Notice kind="warning"><b>AI ต้องการคำตอบก่อน:</b><ul className="list-disc ml-5 mt-1">{d.questions.map((q: string, i: number) => <li key={i}>{q}</li>)}</ul></Notice>}
        {d.newTerms.length > 0 && <Table head={['', 'คำศัพท์ใหม่', 'หมายถึง', 'ชนิด']}>{d.newTerms.map((t: any, i: number) => <tr key={i}><Td><input type="checkbox" checked={!!pick[`n${i}`]} onChange={e => setPick({ ...pick, [`n${i}`]: e.target.checked })} /></Td><Td>{t.term}</Td><Td mono>{t.path}</Td><Td>{t.type}</Td></tr>)}</Table>}
        <Table head={['', 'กฎ', 'ประโยค', 'ที่มา', 'ตรวจ']}>{d.rules.map((r: any, i: number) => <tr key={i}><Td><input type="checkbox" disabled={!r.ok} checked={!!pick[`r${i}`]} onChange={e => setPick({ ...pick, [`r${i}`]: e.target.checked })} /></Td><Td>{r.name}</Td><Td className="!whitespace-normal text-[13px]">{r.canonical || r.sentence}</Td><Td className="!whitespace-normal text-[12px] text-[#525252]">{r.source}</Td><Td>{r.ok ? <Tag tone="green">ถูกต้อง</Tag> : <span title={(r.errors || []).map((e: any) => e.message).join('\n')}><Tag tone="red">ต้องแก้</Tag></span>}</Td></tr>)}</Table>
        {d.tests.length > 0 && <Table head={['', 'กรณีทดสอบ', 'คาดว่า']}>{d.tests.map((t: any, i: number) => <tr key={i}><Td><input type="checkbox" checked={!!pick[`t${i}`]} onChange={e => setPick({ ...pick, [`t${i}`]: e.target.checked })} /></Td><Td>{t.name}</Td><Td className="text-[12px]">{(t.expectations || []).map((x: any) => `${x.kind} ${x.code || x.path || ''}`).join(' · ')}</Td></tr>)}</Table>}
        <Panel>
          <div className="grid grid-cols-[320px_auto] gap-4 items-end">
            <div><div className="text-[12px] text-[#525252] mb-1.5">ผูกกรณีทดสอบกับ Decision Flow</div><Dropdown value={flow} onChange={setFlow} options={(flows as any[]).filter(f => f.kind === 'decision').map(f => ({ value: f.slug, label: f.name }))} /></div>
            <Btn onClick={() => apply.mutate()} disabled={apply.isPending}>บันทึกที่เลือกเป็นร่าง</Btn>
          </div>
          {apply.data && <div className="mt-3"><Notice kind="success">เพิ่มคำศัพท์ {apply.data.terms} · กฎร่าง {apply.data.rules.length} · กรณีทดสอบ {apply.data.tests}{apply.data.errors.length ? ` · ผิดพลาด ${apply.data.errors.join(', ')}` : ''}</Notice></div>}
        </Panel>
      </>}
    </div>
  );
}

function Terms({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ term: '', path: '', type: 'text', values: '' });
  const { data: terms = [] } = useQuery({ queryKey: ['vocab', projectId], queryFn: () => api.get<any[]>(`/platform/vocabulary?project_id=${projectId}`) });
  const { data: sug = [] } = useQuery({ queryKey: ['vocab-sug', projectId], queryFn: () => api.get<any[]>(`/platform/vocabulary/suggest?project_id=${projectId}`) });
  const save = useMutation({ mutationFn: (t: any) => api.post('/platform/vocabulary', { projectId, ...t }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['vocab', projectId] }); qc.invalidateQueries({ queryKey: ['vocab-sug', projectId] }); setF({ term: '', path: '', type: 'text', values: '' }); } });
  const del = useMutation({ mutationFn: (id: string) => api.del(`/platform/vocabulary/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['vocab', projectId] }) });
  return (
    <div className="space-y-4">
      <Panel title="เพิ่มคำศัพท์">
        <div className="grid grid-cols-[1fr_1fr_160px_1fr_auto] gap-3 items-end">
          <Input id="t-term" label="คำ" value={f.term} onChange={(v: string) => setF({ ...f, term: v })} />
          <Input id="t-path" label="หมายถึงข้อมูล" mono value={f.path} onChange={(v: string) => setF({ ...f, path: v })} placeholder="item.unitPrice" />
          <div><div className="text-[12px] text-[#525252] mb-1.5">ชนิด</div><Dropdown value={f.type} onChange={v => setF({ ...f, type: v })} options={[{ value: 'text', label: 'ข้อความ' }, { value: 'number', label: 'ตัวเลข' }, { value: 'money', label: 'จำนวนเงิน' }, { value: 'date', label: 'วันที่' }, { value: 'enum', label: 'รายการค่า' }]} /></div>
          <Input id="t-vals" label="ค่าที่เป็นได้ (คั่นด้วย ,)" value={f.values} onChange={(v: string) => setF({ ...f, values: v })} />
          <Btn onClick={() => save.mutate({ term: f.term, path: f.path, type: f.type, values: f.values.split(',').map(s => s.trim()).filter(Boolean) })} disabled={!f.term || !f.path}>เพิ่ม</Btn>
        </div>
      </Panel>
      <Table head={['คำ', 'หมายถึง', 'ชนิด', 'ค่าที่เป็นได้', '']}>
        {(terms as any[]).map(t => <tr key={t.id}><Td>{t.term}</Td><Td mono>{t.path}</Td><Td>{t.type}</Td><Td>{t.values.join(', ')}</Td><Td><button className="h-8 px-3 text-[#da1e28] hover:bg-[#fff1f1]" onClick={() => del.mutate(t.id)}>ลบ</button></Td></tr>)}
      </Table>
      {(sug as any[]).length > 0 && <>
        <h2 className="text-[16px] mt-6">ข้อมูลที่พบในคำขอจริงแต่ยังไม่มีคำศัพท์</h2>
        <Table head={['ข้อมูล', 'ตัวอย่างค่า', '']}>{(sug as any[]).slice(0, 30).map(s => <tr key={s.path}><Td mono>{s.path}</Td><Td mono>{String(s.example)}</Td><Td><button className="h-8 px-3 text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={() => setF({ ...f, path: s.path, type: s.type })}>ตั้งชื่อ</button></Td></tr>)}</Table>
      </>}
    </div>
  );
}
