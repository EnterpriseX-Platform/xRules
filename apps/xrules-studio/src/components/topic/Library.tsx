'use client';
// Sharing across products: a step's library reference (Use / Extend / Own, which version), its lines with where each came
// from, "Make it a setting" on a number, taking a library item into a step, a newer version, and New product from a product.
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Input, Modal } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';
import { tableSentences } from '@/components/review/sentences';

export type Mode = 'use' | 'extend' | 'own';
const MODES: { v: Mode; label: string }[] = [{ v: 'use', label: 'Use' }, { v: 'extend', label: 'Extend' }, { v: 'own', label: 'Own' }];

/** The plain-text origin a box shows on the map. */
export function originOf(d: any): string {
  if (d?.library) return 'Library item';
  const r = d?.libraryRef; if (!r?.itemId) return '';
  return r.mode === 'own' ? 'Own' : r.mode === 'extend' && ((r.diff?.off || []).length || (r.diff?.added || []).length || Object.keys(r.diff?.props || {}).length) ? 'Library · changed here' : 'Library';
}

/** One line in words: a decision line as a sentence, a calculation line as word = formula. */
export function lineText(type: string, line: any, columns: any, label: (p: string) => string) {
  if (String(type).toUpperCase() === 'FORMULA') return `${label(line?.name || '')} = ${String(line?.expr ?? '')}`;
  return tableSentences({ inputs: columns?.inputs || [], outputs: columns?.outputs || [], rules: [line] }, label)[0] || '';
}

function Seg({ value, onChange, disabled }: { value: Mode; onChange: (m: Mode) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="How this step uses the library item" className="inline-flex border border-[#8d8d8d]">
      {MODES.map(m => <button key={m.v} type="button" role="radio" aria-checked={value === m.v} disabled={disabled} onClick={() => value !== m.v && onChange(m.v)}
        className={`h-8 px-4 text-[14px] border-r border-[#8d8d8d] last:border-r-0 ${value === m.v ? 'bg-[#161616] text-white' : 'text-[#161616] hover:bg-[#e8e8e8]'} disabled:opacity-50`}>{m.label}</button>)}
    </div>
  );
}

const NUM = /-?\d+(?:\.\d+)?/g;
/** The numbers a line holds, with the text they sit in. */
function numbersIn(type: string, line: any): { field: string; from: number; to: number; value: string; text: string }[] {
  const fields: { field: string; text: string }[] = String(type).toUpperCase() === 'FORMULA' ? [{ field: 'expr', text: String(line?.expr ?? '') }]
    : [...(line?.inputs || []).map((c: any, i: number) => ({ field: `inputs.${i}`, text: typeof c === 'string' ? c : '' })), ...(line?.outputs || []).map((c: any, i: number) => ({ field: `outputs.${i}`, text: typeof c === 'string' ? c : typeof c === 'number' ? String(c) : '' }))];
  return fields.flatMap(f => Array.from(f.text.matchAll(NUM)).map(m => ({ field: f.field, from: m.index!, to: m.index! + m[0].length, value: m[0], text: f.text })));
}

/** "Make it a setting": pick the number, name the setting; every product gets the current value. */
export function MakeSetting({ ruleId, type, line, index, label, columns, onClose, onDone }: { ruleId: string; type: string; line: any; index: number; label: (p: string) => string; columns: any; onClose: () => void; onDone: () => void }) {
  const nums = numbersIn(type, line);
  const [pick, setPick] = useState(0); const [name, setName] = useState('');
  const n = nums[pick];
  const go = useMutation({ meta: { silent: true }, mutationFn: () => api.post('/platform/settings-table/make', { ruleId, line: index, field: n.field, from: n.from, to: n.to, name: name.trim() }), onSuccess: () => { onDone(); onClose(); } });
  return (
    <Modal title="Make it a setting" onClose={onClose} onSubmit={() => go.mutate()} submitLabel={go.isPending ? 'Making' : 'Make it a setting'} submitDisabled={!n || !name.trim() || go.isPending} error={go.error ? String((go.error as any).message) : null}>
      <div className="text-[14px] text-[#161616]">{lineText(type, line, columns, label)}</div>
      {nums.length ? <div><div className="text-[12px] text-[#525252] mb-1.5">Number</div>
        <div className="flex flex-wrap gap-2">{nums.map((x, i) => <button key={i} type="button" onClick={() => setPick(i)} className={`h-8 px-3 text-[14px] border tabular-nums ${i === pick ? 'border-[#0f62fe] bg-[#edf5ff] text-[#161616]' : 'border-[#8d8d8d] hover:bg-[#e8e8e8]'}`}>{x.value}</button>)}</div></div>
        : <div className="text-[#6f6f6f]">This line holds no number</div>}
      <Input id="ms-name" label="Setting name" value={name} onChange={setName} placeholder="max DSR (bureau hit)" />
      {n && name.trim() && <div className="text-[13px] text-[#525252]">The line reads <b className="font-semibold text-[#161616]">{name.trim()} of this product</b>; every product starts with {n.value}</div>}
    </Modal>
  );
}

/** The library part of a box panel: how this step uses the item, which version, every line and where it came from. */
export function LibrarySection({ projectId, d, label, canWrite }: { projectId: string; d: any; label: (p: string) => string; canWrite: boolean }) {
  const qc = useQueryClient();
  const key = ['library-ref', d.id, d.updatedAt];
  const { data: info } = useQuery({ queryKey: key, queryFn: () => api.get<any>(`/platform/library/ref/${d.id}`), enabled: d.kind === 'rule' });
  const done = () => { qc.invalidateQueries({ queryKey: ['library-ref', d.id] }); qc.invalidateQueries({ queryKey: ['topic'] }); qc.invalidateQueries({ queryKey: ['library'] }); };
  const set = useMutation({ meta: { failLabel: "Couldn't change" }, mutationFn: (b: any) => api.post(`/platform/library/ref/${d.id}`, b), onSuccess: done });
  const line = useMutation({ meta: { failLabel: "Couldn't change the line" }, mutationFn: (b: any) => api.post(`/platform/library/ref/${d.id}/line`, b), onSuccess: done });
  const move = useMutation({ meta: { failLabel: "Couldn't move to library" }, mutationFn: () => api.post('/platform/library/move', { ruleIds: [d.id] }), onSuccess: done });
  const [compare, setCompare] = useState(false);
  const [setting, setSetting] = useState<number | null>(null);
  const H = ({ children }: { children: React.ReactNode }) => <h3 className="m-0 mb-2 text-[12px] font-semibold tracking-[.4px] text-[#525252]">{children}</h3>;
  if (d.kind !== 'rule' || !info) return null;
  const sharable = d.type === 'DECISION_TABLE' || d.type === 'FORMULA';
  const lines: any[] = info.lines || (d.type === 'FORMULA' ? d.definition?.lines || [] : d.definition?.rules || []).map((l: any) => ({ line: l, from: '' }));
  const cols = info.columns || { inputs: d.definition?.inputs, outputs: d.definition?.outputs };
  const mk = setting !== null && <MakeSetting ruleId={d.id} type={d.type} line={lines[setting]?.line} index={setting} label={label} columns={cols} onClose={() => setSetting(null)} onDone={done} />;
  const settingBtn = (i: number) => canWrite && numbersIn(d.type, lines[i]?.line).length > 0 && <button type="button" className="text-[13px] text-[#0f62fe] hover:underline whitespace-nowrap" onClick={() => setSetting(i)}>Make it a setting</button>;

  if (info.kind === 'none' || info.kind === 'item') return (
    <div className="mt-6">
      <H>ORIGIN</H>
      <div className="flex flex-wrap items-center gap-3 text-[14px]"><span>{info.kind === 'item' ? 'Library item' : 'Made here'}</span>
        {info.kind === 'none' && canWrite && sharable && <button type="button" className="h-8 px-3 text-[14px] border border-[#8d8d8d] hover:bg-[#e8e8e8]" disabled={move.isPending} onClick={() => move.mutate()}>Move to library</button>}
        {info.kind === 'item' && <Link href={`/p/${projectId}/library?item=${d.id}`}>See who uses it</Link>}</div>
      {canWrite && sharable && lines.some((_, i) => numbersIn(d.type, lines[i].line).length) && (
        <ol className="m-0 mt-3 pl-0 list-none space-y-1 text-[14px]">{lines.map((l, i) => <li key={i} className="flex gap-3 items-baseline"><span className="text-[#6f6f6f] tabular-nums w-6 shrink-0">{i + 1}</span><span className="flex-1">{lineText(d.type, l.line, cols, label)}</span>{settingBtn(i)}</li>)}</ol>)}
      {mk}
    </div>
  );
  if (info.kind === 'missing') return <div className="mt-6 text-[14px] text-[#da1e28]">The library item this step used is not there any more</div>;

  const pinOpts = [{ value: 'latest', label: `Latest approved${info.latest ? ` (v${info.latest})` : ''}` }, ...(info.versions || []).map((v: any) => ({ value: String(v.version), label: `Stay on v${v.version}` }))];
  return (
    <div className="mt-6">
      <H>FROM THE LIBRARY</H>
      <div className="flex flex-wrap items-center gap-3 text-[14px]">
        <Link href={`/p/${projectId}/library?item=${info.itemId}`}>{info.item}</Link>
        <span className="text-[#525252]">{info.mode === 'own' ? `copied from ${info.copiedFrom?.name || info.item} v${info.copiedFrom?.version ?? '?'}` : `v${info.version ?? '?'}`}</span>
        <span className="flex-1" />
        {canWrite ? <Seg value={info.mode} disabled={set.isPending} onChange={m => set.mutate({ mode: m })} /> : <span>{MODES.find(m => m.v === info.mode)?.label}</span>}
        {info.mode !== 'own' && (canWrite ? <span className="w-[220px]"><Dropdown value={String(info.pin)} options={pinOpts} onChange={v => set.mutate({ pin: v === 'latest' ? 'latest' : Number(v) })} /></span>
          : <span>{info.pin === 'latest' ? 'Latest approved' : `Stays on v${info.pin}`}</span>)}
      </div>
      {info.mode !== 'own' && info.pin !== 'latest' && info.latest > info.pin && <div className="mt-2 text-[14px]">v{info.latest} is approved · <Link href="/">see it on Home</Link></div>}
      {info.mode === 'own' && <div className="mt-2 text-[14px]">{info.differ ? `${info.differ} line${info.differ === 1 ? '' : 's'} differ from library v${info.compare?.libraryVersion}` : `Same lines as library v${info.compare?.libraryVersion}`}{info.differ > 0 && <> · <button type="button" className="text-[#0f62fe] hover:underline" onClick={() => setCompare(c => !c)}>{compare ? 'Hide compare' : 'Compare'}</button></>}</div>}
      {compare && info.compare && (
        <div className="mt-3 grid gap-4 md:grid-cols-2 text-[14px]">
          <div><div className="text-[12px] text-[#525252] mb-1">Only in the library</div>{info.compare.onlyLibrary.map((l: any, i: number) => <div key={i} className="py-1 border-b border-[#e0e0e0]">{lineText(d.type, l, cols, label)}</div>)}{!info.compare.onlyLibrary.length && <div className="text-[#6f6f6f]">None</div>}</div>
          <div><div className="text-[12px] text-[#525252] mb-1">Only here</div>{info.compare.onlyHere.map((l: any, i: number) => <div key={i} className="py-1 border-b border-[#e0e0e0]">{lineText(d.type, l, cols, label)}</div>)}{!info.compare.onlyHere.length && <div className="text-[#6f6f6f]">None</div>}</div>
        </div>)}
      <ol className="m-0 mt-4 pl-0 list-none text-[14px] leading-[22px]">
        {lines.map((l: any, i: number) => (
          <li key={l.key + i} className={`flex gap-3 items-baseline py-1.5 border-b border-[#e0e0e0] ${l.local ? 'border-l-2 border-l-[#0f62fe] pl-2' : 'pl-2.5'}`}>
            <span className="text-[#6f6f6f] tabular-nums w-6 shrink-0">{i + 1}</span>
            <span className={`flex-1 ${info.mode !== 'own' && !l.local ? 'text-[#6f6f6f]' : 'text-[#161616]'}`}>{lineText(d.type, l.line, cols, label)}</span>
            <span className="text-[12px] text-[#525252] whitespace-nowrap">{l.from}</span>
            {settingBtn(i)}
            {canWrite && info.mode !== 'own' && !l.local && <button type="button" className="text-[13px] text-[#0f62fe] hover:underline whitespace-nowrap" disabled={line.isPending} onClick={() => line.mutate({ key: l.key, off: true })}>Switch off here</button>}
          </li>))}
      </ol>
      {(info.off || []).length > 0 && (
        <div className="mt-3"><div className="text-[12px] text-[#525252] mb-1">Library lines switched off here</div>
          {info.off.map((o: any) => <div key={o.key} className="flex gap-3 items-baseline py-1.5 border-b border-[#e0e0e0] text-[14px]"><span className="flex-1 text-[#6f6f6f] line-through">{lineText(d.type, o.line, cols, label)}</span>
            {canWrite && <button type="button" className="text-[13px] text-[#0f62fe] hover:underline" onClick={() => line.mutate({ key: o.key, off: false })}>Switch on</button>}</div>)}
        </div>)}
      {mk}
    </div>
  );
}

/** Take a library item into a step. */
export function FromLibrary({ projectId, topicId, stageId, onClose }: { projectId: string; topicId: string; stageId?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({ queryKey: ['library', projectId], queryFn: () => api.get<any[]>(`/platform/library?project_id=${projectId}`) });
  const [itemId, setItem] = useState(''); const [mode, setMode] = useState<Mode>('use');
  const go = useMutation({ meta: { silent: true }, mutationFn: () => api.post('/platform/library/reference', { topicId, stageId, itemId, mode }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['topic', topicId] }); onClose(); } });
  return (
    <Modal title="From the library" onClose={onClose} onSubmit={() => go.mutate()} submitLabel={go.isPending ? 'Adding' : 'Add to step'} submitDisabled={!itemId || go.isPending} error={go.error ? String((go.error as any).message) : null}>
      <div><div className="text-[12px] text-[#525252] mb-1.5">Library item</div>
        <Dropdown value={itemId} placeholder={(items as any[]).length ? 'Choose' : 'The library is empty'} options={(items as any[]).map(i => ({ value: i.id, label: `${i.name} · v${i.latest ?? i.version}` }))} onChange={setItem} /></div>
      <div><div className="text-[12px] text-[#525252] mb-1.5">This step</div><Seg value={mode} onChange={setMode} /></div>
    </Modal>
  );
}

/** A step on a fixed version while a newer one is approved: see the difference, take the new version (tests run first). */
export function NewerVersion({ row, onDone }: { row: any; onDone: () => void }) {
  const [view, setView] = useState<'diff' | 'take' | null>(null);
  const { data: diff } = useQuery({ queryKey: ['lib-diff', row.ruleId, row.latest], queryFn: () => api.get<any>(`/platform/library/ref/${row.ruleId}/difference`), enabled: view === 'diff' });
  const take = useMutation({ meta: { silent: true }, mutationFn: (force: boolean) => api.post<any>(`/platform/library/ref/${row.ruleId}/take`, { force }), onSuccess: (r: any) => { if (r.taken) onDone(); } });
  const res: any = take.data;
  return (
    <>
      <span className="flex gap-3 whitespace-nowrap text-[14px]"><button type="button" className="text-[#0f62fe] hover:underline" onClick={() => setView('diff')}>See difference</button><button type="button" className="text-[#0f62fe] hover:underline" onClick={() => { setView('take'); take.mutate(false); }}>Take new version</button></span>
      {view === 'diff' && <Modal title={`${row.name}: v${row.pin} to v${row.latest}`} wide onClose={() => setView(null)}>
        {!diff ? <div className="text-[#6f6f6f]">Reading</div> : <>
          <div className="text-[12px] text-[#525252]">New in v{diff.to}</div>{diff.added.map((l: any, i: number) => <div key={i} className="py-1 border-b border-[#e0e0e0]">{lineText(diff.type, l, diff.columns, x => x)}</div>)}{!diff.added.length && <div className="text-[#6f6f6f]">None</div>}
          <div className="text-[12px] text-[#525252] mt-3">Not in v{diff.to} any more</div>{diff.removed.map((l: any, i: number) => <div key={i} className="py-1 border-b border-[#e0e0e0] line-through text-[#6f6f6f]">{lineText(diff.type, l, diff.columns, x => x)}</div>)}{!diff.removed.length && <div className="text-[#6f6f6f]">None</div>}
        </>}
      </Modal>}
      {view === 'take' && <Modal title={`Take v${row.latest} for ${row.product || row.topic}`} onClose={() => setView(null)}
        onSubmit={res && !res.taken ? () => take.mutate(true) : undefined} submitLabel="Take it anyway" error={take.error ? String((take.error as any).message) : null}>
        {take.isPending && <div className="text-[#6f6f6f]">Running {row.product || row.topic} test cases</div>}
        {res?.taken && <div className="text-[#198038]">Taken · {res.total} test case{res.total === 1 ? '' : 's'}{res.failed.length ? `, ${res.failed.length} fail` : ', all pass'}</div>}
        {res && !res.taken && <><div className="text-[#da1e28]">{res.failed.length} of {res.total} test cases fail with v{res.version}; the step stays on v{row.pin}</div>
          {res.failed.map((f: any) => <div key={f.name} className="py-1 border-b border-[#e0e0e0]"><div>{f.name}</div><div className="text-[12px] text-[#525252]">{f.checks.filter((c: any) => !c.ok).map((c: any) => c.message).join(' · ')}</div></div>)}</>}
      </Modal>}
    </>
  );
}

/** New product from <product>: each step Use / Extend / Own; settings and test cases copied. */
export function NewProductFrom({ topic, onClose, onMade }: { topic: any; onClose: () => void; onMade: (id: string) => void }) {
  const ds: any[] = (topic.decisions || []).filter((d: any) => d.kind === 'rule');
  const [product, setProduct] = useState(''); const [cases, setCases] = useState(true);
  const [modes, setModes] = useState<Record<string, Mode>>(() => Object.fromEntries(ds.map(d => [d.id, d.libraryRef?.mode === 'own' ? 'own' : d.libraryRef?.mode === 'extend' ? 'extend' : 'use'])));
  const go = useMutation({ meta: { silent: true }, mutationFn: () => api.post<any>('/platform/products/new', { topicId: topic.id, product: product.trim(), modes, copyCases: cases }), onSuccess: (r: any) => onMade(r.id) });
  const step = (id: string) => (topic.stages || []).find((s: any) => s.items.includes(id))?.name;
  return (
    <Modal title={`New product from ${topic.product || topic.name}`} wide onClose={onClose} onSubmit={() => go.mutate()} submitLabel={go.isPending ? 'Making' : 'Make product'} submitDisabled={!product.trim() || go.isPending} error={go.error ? String((go.error as any).message) : null}>
      <Input id="np-name" label="New product" value={product} onChange={setProduct} placeholder="Portfolio" />
      <div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] h-8 items-center text-[12px] font-semibold text-[#525252] border-b border-[#e0e0e0]"><span>Step · decision</span><span>Takes it as</span></div>
        {ds.map(d => <div key={d.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2 border-b border-[#e0e0e0]"><span className="min-w-0"><span className="block">{d.name}</span><span className="block text-[12px] text-[#525252]">{[step(d.id), originOf(d) || 'Made here'].filter(Boolean).join(' · ')}</span></span>
          <Seg value={modes[d.id]} onChange={m => setModes({ ...modes, [d.id]: m })} /></div>)}
      </div>
      <label className="flex items-center gap-2 text-[14px] cursor-pointer"><input type="checkbox" className="h-4 w-4 accent-[#161616]" checked={cases} onChange={e => setCases(e.target.checked)} />Copy the test cases</label>
    </Modal>
  );
}
