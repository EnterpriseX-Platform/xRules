'use client';
import { useSearchParams } from 'next/navigation';
import { useDevMode } from '@/lib/devmode';
import { Chip } from '@/components/links/Links';
const TYPE_NAME: Record<string, string> = { text: 'Text', number: 'Number', money: 'Money', date: 'Date', enum: 'List of values', boolean: 'Yes / no' };
import { useEffect, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { ImportTerms } from '@/components/vocab/ImportTerms';
import { ReasonCodes } from '@/components/vocab/ReasonCodes';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, Btn, Input, TextArea, Panel, Notice, Tabs, DropZone, Modal } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';
import { useListRemove, RemovedCell } from '@/lib/listRemove';

const TABS = [{ key: '', label: 'Vocabulary' }, { key: 'reasons', label: 'Reason codes' }, { key: 'write', label: 'Write rules' }, { key: 'cowork', label: 'Rule Cowork' }];

export default function VocabularyPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pathname = usePathname() || ''; const router = useRouter();
  const seg = pathname.split('/')[4] || '';
  const tab = TABS.find(t => t.key === seg) || TABS[0];
  return (
    <div className="px-8 py-6">
      <PageHead title="Words" />
      <Tabs tabs={TABS.map(t => t.label)} value={tab.label} onChange={l => { const k = TABS.find(t => t.label === l)!.key; router.replace(`/p/${projectId}/vocabulary${k ? `/${k}` : ''}`, { scroll: false }); }} />
      {tab.key === '' && <Terms projectId={projectId} />}
      {tab.key === 'reasons' && <ReasonCodes projectId={projectId} />}
      {tab.key === 'write' && <Writer projectId={projectId} />}
      {tab.key === 'cowork' && <Cowork projectId={projectId} />}
    </div>
  );
}

function Writer({ projectId }: { projectId: string }) {
  const [sentence, setSentence] = useState('IF amount GREATER THAN 100,000 THEN WARN "Amount needs a second approval" LEVEL WARNING CODE RULE-001');
  const [name, setName] = useState('');
  const { data: terms = [] } = useQuery({ queryKey: ['vocab', projectId], queryFn: () => api.get<any[]>(`/platform/vocabulary?project_id=${projectId}`) });
  const check = useMutation({ mutationFn: () => api.post<any>('/platform/vocabulary/check', { projectId, sentence }) });
  const save = useMutation({ meta: { silent: true }, mutationFn: () => api.post<any>('/platform/vocabulary/rules', { projectId, name, sentence }) });
  const insert = (w: string) => setSentence(s => `${s.trimEnd()} ${w} `);
  return (
    <div className="grid gap-4 items-start lg:grid-cols-[1fr_300px]">
      <Panel title="Rule sentence">
        <TextArea id="sent" rows={4} mono={false} value={sentence} onChange={(v: string) => { setSentence(v); check.reset(); }} />
        <div className="mt-2 flex flex-wrap gap-1">
          {['IF', 'AND', 'OR', 'THEN', 'IS', 'IS NOT', 'GREATER THAN', 'LESS THAN', 'AT MOST', 'AT LEAST', 'IN', 'NOT IN', 'IS EMPTY', 'IS NOT EMPTY', 'WARN', 'FAIL', 'LEVEL ERROR', 'LEVEL WARNING', 'CODE'].map(w =>
            <button key={w} className="h-7 px-2 text-[12px] bg-[#e0e0e0] hover:bg-[#c6c6c6]" onClick={() => insert(w)}>{w}</button>)}
        </div>
        <div className="mt-4 flex gap-2"><Btn kind="tertiary" onClick={() => check.mutate()} disabled={check.isPending}>Check sentence</Btn></div>
        {check.data && (check.data.ok ? <div className="mt-4 space-y-3">
          <Notice kind="success">Valid sentence · read back as: {check.data.canonical}</Notice>
          <details><summary className="text-[14px] text-[#0f62fe] cursor-pointer">Show generated rule</summary><pre className="bg-[#f4f4f4] p-3 text-[12px] font-mono mt-2 overflow-auto">{check.data.source}</pre></details>
          <div className="grid grid-cols-[1fr_auto] gap-2 items-end"><Input id="rule-name" label="Rule name" value={name} onChange={setName} placeholder="tor-4-4-1-3" /><Btn onClick={() => save.mutate()} disabled={!name || save.isPending}>Save as draft</Btn></div>
          {save.isSuccess && <Notice kind="success">Saved rule {save.data.slug} as a draft · test it and send it for review before publishing</Notice>}
          {save.error && <Notice kind="error">{String((save.error as any).message)}</Notice>}
        </div> : <div className="mt-4 space-y-2">{check.data.errors.map((e: any, i: number) => <Notice key={i} kind="error">{e.message}{e.suggestions?.length ? <div className="mt-1 flex flex-wrap gap-1">{e.suggestions.map((s: string) => <button key={s} className="h-6 px-2 text-[12px] bg-white border border-[#c6c6c6]" onClick={() => insert(s)}>{s}</button>)}</div> : null}</Notice>)}</div>)}
      </Panel>
      <Panel title="Available terms">
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
  const draft = useMutation({ meta: { silent: true }, mutationFn: () => api.post<any>('/platform/cowork/draft', { projectId, text }), onSuccess: d => setPick(Object.fromEntries([...d.rules.map((r: any, i: number) => [`r${i}`, r.ok]), ...d.tests.map((_: any, i: number) => [`t${i}`, true]), ...d.newTerms.map((_: any, i: number) => [`n${i}`, true])])) });
  const apply = useMutation({ mutationFn: () => api.post<any>('/platform/cowork/apply', { projectId, flow: flow || undefined,
    newTerms: draft.data.newTerms.filter((_: any, i: number) => pick[`n${i}`]), rules: draft.data.rules.filter((_: any, i: number) => pick[`r${i}`]), tests: draft.data.tests.filter((_: any, i: number) => pick[`t${i}`]) }) });
  const d = draft.data;
  const onFile = async (f: File) => setText(await f.text());
  return (
    <div className="space-y-4">
      <Panel title="Describe the conditions or paste a document">
        <TextArea id="cw-text" rows={8} mono={false} value={text} onChange={setText} />
        <div className="mt-3"><DropZone accept=".txt,.md,.csv" onFile={onFile} label="or drop a text file (.txt / .md)" /></div>
        <div className="mt-4 flex gap-2 items-center"><Btn onClick={() => draft.mutate()} disabled={!text.trim() || draft.isPending}>{draft.isPending ? 'AI is drafting' : 'Draft rules with AI'}</Btn></div>
        {draft.error && <div className="mt-3"><Notice kind="error">{String((draft.error as any).message)}</Notice></div>}
      </Panel>
      {d && <>
        {d.questions.length > 0 && <Notice kind="warning"><b>The AI needs answers first:</b><ul className="list-disc ml-5 mt-1">{d.questions.map((q: string, i: number) => <li key={i}>{q}</li>)}</ul></Notice>}
        {d.newTerms.length > 0 && <Table head={['', 'New term', 'Means', 'Type']}>{d.newTerms.map((t: any, i: number) => <tr key={i}><Td><input type="checkbox" checked={!!pick[`n${i}`]} onChange={e => setPick({ ...pick, [`n${i}`]: e.target.checked })} /></Td><Td>{t.term}</Td><Td mono>{t.path}</Td><Td>{t.type}</Td></tr>)}</Table>}
        <Table head={['', 'Rule', 'Sentence', 'Source', 'Check']}>{d.rules.map((r: any, i: number) => <tr key={i}><Td><input type="checkbox" disabled={!r.ok} checked={!!pick[`r${i}`]} onChange={e => setPick({ ...pick, [`r${i}`]: e.target.checked })} /></Td><Td>{r.name}</Td><Td className="!whitespace-normal text-[13px]">{r.canonical || r.sentence}</Td><Td className="!whitespace-normal text-[12px] text-[#525252]">{r.source}</Td><Td>{r.ok ? <Tag tone="green">Valid</Tag> : <span title={(r.errors || []).map((e: any) => e.message).join('\n')}><Tag tone="red">Needs fixing</Tag></span>}</Td></tr>)}</Table>
        {d.tests.length > 0 && <Table head={['', 'Test case', 'Expects']}>{d.tests.map((t: any, i: number) => <tr key={i}><Td><input type="checkbox" checked={!!pick[`t${i}`]} onChange={e => setPick({ ...pick, [`t${i}`]: e.target.checked })} /></Td><Td>{t.name}</Td><Td className="text-[12px]">{(t.expectations || []).map((x: any) => `${x.kind} ${x.code || x.path || ''}`).join(' · ')}</Td></tr>)}</Table>}
        <Panel>
          <div className="grid gap-4 items-end sm:grid-cols-[320px_auto]">
            <div><div className="text-[12px] text-[#525252] mb-1.5">Attach test cases to decision flow</div><Dropdown value={flow} onChange={setFlow} options={(flows as any[]).filter(f => f.kind === 'decision').map(f => ({ value: f.slug, label: f.name }))} /></div>
            <Btn onClick={() => apply.mutate()} disabled={apply.isPending}>Save selected as drafts</Btn>
          </div>
          {apply.data && <div className="mt-3"><Notice kind="success">Terms {apply.data.terms} · draft rules {apply.data.rules.length} · test cases {apply.data.tests}{apply.data.errors.length ? ` · Errors ${apply.data.errors.join(', ')}` : ''}</Notice></div>}
        </Panel>
      </>}
    </div>
  );
}

function Terms({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const askImport = useSearchParams()?.get('import') === '1';
  useEffect(() => { if (askImport) setImportOpen(true); }, [askImport]);
  const blankT = { id: '', term: '', path: '', type: 'text', values: '', unit: '' };
  const [f, setF] = useState<any>(blankT);
  const { data: terms = [] } = useQuery({ queryKey: ['vocab', projectId], queryFn: () => api.get<any[]>(`/platform/vocabulary?project_id=${projectId}`) });
  const { data: sug = [] } = useQuery({ queryKey: ['vocab-sug', projectId], queryFn: () => api.get<any[]>(`/platform/vocabulary/suggest?project_id=${projectId}`) });
  const save = useMutation({ mutationFn: (t: any) => api.post('/platform/vocabulary', { projectId, ...t }), onSuccess: () => { setAddOpen(false); qc.invalidateQueries({ queryKey: ['vocab', projectId] }); qc.invalidateQueries({ queryKey: ['vocab-sug', projectId] }); setF(blankT); } });
  const [dev] = useDevMode(); const [q, setQ] = useState('');
  const { data: usage } = useQuery({ queryKey: ['vocab-usage', projectId], queryFn: () => api.get<any>(`/platform/vocabulary-usage?project_id=${projectId}`) });
  const shown = (terms as any[]).filter(t => !q || `${t.term} ${t.path} ${t.description || ''}`.toLowerCase().includes(q.toLowerCase()));
  const del = useListRemove<any>({ queryKey: ['vocab', projectId], also: [['vocab-sug', projectId]], noun: 'word', name: t => `"${t.term}"`,
    remove: t => api.del(`/platform/vocabulary/${t.id}`),
    restore: t => api.post('/platform/vocabulary', { projectId, term: t.term, path: t.path, type: t.type, unit: t.unit, description: t.description, values: t.values || [] }) });
  const edit = (t: any) => { save.reset(); setF({ id: t.id, term: t.term, path: t.path, type: t.type, unit: t.unit || '', values: (t.values || []).join(', '), description: t.description }); setAddOpen(true); };
  return (
    <div className="space-y-4">
      <div className="flex gap-2"><Btn onClick={() => { setF(blankT); setAddOpen(true); }}>Add term</Btn><Btn kind="tertiary" onClick={() => setImportOpen(true)}>Import</Btn></div>
      {importOpen && <ImportTerms projectId={projectId} known={terms as any[]} onClose={() => setImportOpen(false)} />}
      {addOpen && <Modal title={f.id ? 'Edit term' : 'Add term'} onClose={() => setAddOpen(false)} wide onSubmit={() => save.mutate({ id: f.id || undefined, term: f.term, path: f.path, type: f.type, unit: f.unit, description: f.description, values: String(f.values || '').split(',').map((s: string) => s.trim()).filter(Boolean) })} submitLabel={f.id ? 'Save' : 'Add'} submitDisabled={!f.term || !f.path} error={save.error ? String((save.error as any).message) : null}>
        <div className="grid gap-4">
          <Input id="t-term" label="Term" value={f.term} onChange={(v: string) => setF({ ...f, term: v })} />
          <Input id="t-path" label="Data path" mono value={f.path} onChange={(v: string) => setF({ ...f, path: v })} placeholder="item.unitPrice" />
          <div><div className="text-[12px] text-[#525252] mb-1.5">Type</div><Dropdown value={f.type} onChange={v => setF({ ...f, type: v })} options={[{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'money', label: 'Money' }, { value: 'date', label: 'Date' }, { value: 'enum', label: 'List of values' }, { value: 'boolean', label: 'Yes / no' }]} /></div>
          <Input id="t-unit" label="Unit" value={f.unit} onChange={(v: string) => setF({ ...f, unit: v })} placeholder="THB" />
          <Input id="t-vals" label="Allowed values" placeholder="Y, N" value={f.values} onChange={(v: string) => setF({ ...f, values: v })} />
        </div>
      </Modal>}
      <div className="flex items-center gap-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find words" aria-label="Find words" className="h-10 w-[280px] px-4 bg-white border-b border-[#8d8d8d] text-[14px] outline-none focus:outline focus:outline-2 focus:outline-[#0f62fe]" />
        <span className="text-[13px] text-[#525252] tabular-nums">{shown.length.toLocaleString()} word{shown.length === 1 ? '' : 's'}</span>
      </div>
      <Table head={['Word', ...(dev ? ['Data path'] : []), 'Type', 'Comes from', 'Used in', '']}>
        {shown.map(t => {
          const by = (usage as any)?.[t.path] || [];
          const requested = String(t.description || '').startsWith('Requested');
          return (
            <tr key={t.id} className={del.isRemoved(t) ? 'text-[#8d8d8d] [&>td:not(:last-child)]:line-through' : 'cursor-pointer hover:bg-[#f4f4f4]'} onClick={() => !del.isBusy(t) && edit(t)}>
              <Td><span className="text-[#161616]">{t.term}</span>{t.values?.length > 0 && <div className="text-[12px] text-[#525252] whitespace-normal">{t.values.slice(0, 6).join(', ')}{t.values.length > 6 ? ` and ${t.values.length - 6} more` : ''}</div>}</Td>
              {dev && <Td mono>{t.path}</Td>}
              <Td>{TYPE_NAME[t.type] || t.type}{t.unit ? ` · ${t.unit}` : ''}</Td>
              <Td className="!whitespace-normal">{requested ? <span className="text-[#8a3800]">Asked from IT</span> : <span className="text-[#525252]">{t.description || ''}</span>}</Td>
              <Td className="!whitespace-normal">{by.length ? <span className="flex flex-wrap gap-x-3 gap-y-1" onClick={e => e.stopPropagation()}>{by.slice(0, 4).map((u: any) => <Chip key={u.id} item={{ kind: u.kind, id: u.id, name: u.name, href: u.href }} />)}{by.length > 4 && <span className="text-[#525252]">and {by.length - 4} more</span>}</span> : <span className="text-[#6f6f6f]">Not used yet</span>}</Td>
              <Td className="whitespace-nowrap">{del.isRemoved(t) ? <RemovedCell onUndo={() => del.undo(t)} /> : <><button className="h-8 px-3 text-[#0f62fe] hover:bg-[#e8e8e8] disabled:text-[#8d8d8d]" disabled={del.isBusy(t)} onClick={e => { e.stopPropagation(); edit(t); }}>Edit</button><button className="h-8 px-3 text-[#da1e28] hover:bg-[#fff1f1] disabled:text-[#8d8d8d]" disabled={del.isBusy(t)} onClick={e => { e.stopPropagation(); del.request(t); }}>Remove</button></>}</Td>
            </tr>
          );
        })}
      </Table>
      {(sug as any[]).length > 0 && <>
        <h2 className="text-[16px] mt-6">Fields seen in real requests that have no term yet</h2>
        <Table head={['Field', 'Example', '']}>{(sug as any[]).slice(0, 30).map(s => <tr key={s.path}><Td mono>{s.path}</Td><Td mono>{String(s.example)}</Td><Td><button className="h-8 px-3 text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={() => { setF({ ...blankT, path: s.path, type: s.type }); setAddOpen(true); }}>Name it</button></Td></tr>)}</Table>
      </>}
    </div>
  );
}
