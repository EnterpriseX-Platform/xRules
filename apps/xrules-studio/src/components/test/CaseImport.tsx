'use client';
// Bring in many test cases at once: a dropped .xlsx / .csv / .json, or rows pasted from Excel or a JSON array.
// Each column is matched to a word by data path or name; a column is an input (what the applicant brings) or an
// expected result (what the topic should answer). Unmatched columns can be pointed at a word or left out.
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DropZone, Modal } from '@/components/pipeline/ui';
import { readTable } from '@/lib/termImport';
import { useTerms } from '@/lib/terms';

type Col = { head: string; role: 'input' | 'expected' | 'name' | 'skip'; path: string; create?: boolean };
const RESULTS = [{ path: 'outcome', name: 'Final decision' }, { path: 'decisionResult', name: 'Decision result' }, { path: 'reason', name: 'Final reason' }, { path: 'reasons', name: 'All reasons' }, { path: 'reasonText', name: 'Reason text' }];
const NON = new RegExp('[^\\p{L}\\p{N}]+', 'gu');
const norm = (s: string) => String(s ?? '').toLowerCase().replace(NON, '');

function setPath(o: any, path: string, v: any) {
  const ks = path.split('.'); let cur = o;
  ks.slice(0, -1).forEach(k => { cur[k] = cur[k] && typeof cur[k] === 'object' ? cur[k] : {}; cur = cur[k]; });
  cur[ks[ks.length - 1]] = v;
}
const flat = (o: any, p = ''): Record<string, any> => (o && typeof o === 'object' && !Array.isArray(o) ? Object.entries(o).reduce((a, [k, v]) => ({ ...a, ...flat(v, p ? `${p}.${k}` : k) }), {}) : { [p]: o });

// the case's own decision date (Today, days since … read it)
const DATE_IN = { path: 'decisionDate', name: 'Decision date' };
/** A data path for a new word from a column header: "Final credit line" → FinalCreditLine */
const pathFor = (h: string) => { const w = String(h).replace(/^(expected|exp)[\s_:.-]*/i, '').split(NON).filter(Boolean); return w.length === 1 ? w[0] : w.map(x => x[0].toUpperCase() + x.slice(1)).join(''); };
const ROLES: { value: Col['role']; label: string }[] = [{ value: 'input', label: 'Input' }, { value: 'expected', label: 'Expected' }, { value: 'name', label: 'Name' }, { value: 'skip', label: 'Leave out' }];

/** Type-ahead word picker; its list floats above the table (not clipped), Escape closes only the list. */
function WordPick({ value, create, head, options, onChange }: { value: string; create?: boolean; head: string; options: [string, string][]; onChange: (p: { path: string; create?: boolean }) => void }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [hi, setHi] = useState(0);
  const box = useRef<HTMLInputElement>(null); const [at, setAt] = useState<{ left: number; top: number; width: number } | null>(null);
  const cur = create ? `${head} (new word)` : options.find(([p]) => p === value)?.[1] || '';
  const n = norm(q);
  const hits = options.filter(([p, name]) => !n || norm(name).includes(n) || norm(p).includes(n)).slice(0, 60);
  const items: { path: string; label: string; create?: boolean }[] = [{ path: pathFor(q || head), label: `Create word "${(q || head).trim()}"`, create: true }, ...hits.map(([p, name]) => ({ path: p, label: name }))];
  const place = () => { const r = box.current?.getBoundingClientRect(); if (r) setAt({ left: r.left, top: r.bottom, width: Math.max(r.width, 260) }); };
  const pick = (it: typeof items[number]) => { onChange(it.create ? { path: it.path, create: true } : { path: it.path }); setOpen(false); setQ(''); };
  return (
    <div className="relative">
      <input ref={box} className="w-full h-10 px-3 bg-[#f4f4f4] border-b border-[#8d8d8d] text-[14px] outline-none focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2"
        role="combobox" aria-expanded={open} aria-label={`Word for ${head}`} placeholder="Choose a word" value={open ? q : cur}
        onFocus={() => { place(); setOpen(true); setHi(0); }} onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={e => { setQ(e.target.value); setHi(0); setOpen(true); place(); }}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); setOpen(false); setQ(''); return; }
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, items.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
          if (e.key === 'Enter' && open) { e.preventDefault(); e.stopPropagation(); pick(items[hi] || items[0]); }
        }} />
      {open && at && (
        <div role="listbox" className="fixed z-[60] bg-white border border-[#e0e0e0] max-h-64 overflow-y-auto shadow-[0_2px_6px_rgba(0,0,0,.2)]" style={{ left: at.left, top: at.top, width: at.width }}>
          {items.map((it, i) => (
            <button key={(it.create ? '+' : '') + it.path} type="button" role="option" aria-selected={i === hi} onMouseDown={e => { e.preventDefault(); pick(it); }}
              className={`w-full px-3 h-9 text-left text-[14px] truncate ${i === hi ? 'bg-[#e8e8e8]' : 'hover:bg-[#e8e8e8]'} ${it.create ? 'text-[#0f62fe]' : ''}`}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CaseImport({ projectId, topicId, outputs = [], onClose }: { projectId: string; topicId?: string; outputs?: { path: string; name: string }[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { terms } = useTerms(projectId);
  const [paste, setPaste] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [table, setTable] = useState<any[][] | null>(null);
  const [cols, setCols] = useState<Col[]>([]);
  const targets = useMemo(() => {
    const m = new Map<string, string>();
    [...RESULTS, ...outputs].forEach(o => m.set(o.path, terms.find(t => t.path === o.path)?.term || o.name));
    terms.forEach(t => { if (!m.has(t.path)) m.set(t.path, t.term); });
    if (!m.has(DATE_IN.path)) m.set(DATE_IN.path, DATE_IN.name);
    return m;
  }, [terms, outputs]);
  const match = (h: string) => {
    const n = norm(h.replace(/^(expected|exp)[\s_:.-]*/i, ''));
    for (const [p, name] of Array.from(targets)) if (norm(p) === n || norm(name) === n || norm(p.split('.').pop() || '') === n) return p;
    return '';
  };
  // words the topic's cases already expect, and the words the topic hands its answer to, come in as Expected again
  const { data: had = [] } = useQuery({ queryKey: ['topic-tests', topicId], enabled: !!topicId, queryFn: () => api.get<any[]>(`/platform/tests/target/topic/${topicId}`) });
  const { data: topic } = useQuery({ queryKey: ['topic-outputs', topicId], enabled: !!topicId, queryFn: () => api.get<any>(`/platform/topics/${topicId}`) });
  const outputSet = new Set([...RESULTS, ...outputs].map(o => o.path));
  for (const c of had as any[]) for (const e of c?.expectations || []) if (e?.path) outputSet.add(String(e.path).replace(/^\$\.?/, ''));
  for (const v of Object.values(topic?.settings?.outputs || {})) if (v) outputSet.add(String(v));
  const load = (t: any[][]) => {
    if (!t.length || !t[0]?.length) throw new Error('Nothing to read');
    setTable(t);
    setCols((t[0] || []).map((h: any) => {
      const head = String(h ?? '').trim(); const bare = norm(head.replace(/^(expected|exp)[\s_:.-]*/i, ''));
      const path = match(head) || Array.from(outputSet).find(p => norm(p) === bare || norm(p.split('.').pop() || '') === bare) || '';
      const role: Col['role'] = /^(name|case|case ?(id|name|no\.?)|test ?case|scenario( ?(id|name))?|id|no\.?)$/i.test(head.trim()) ? 'name' : /^(expected|exp)\b/i.test(head) || outputSet.has(path) ? 'expected' : path ? 'input' : 'skip';
      return { head, role, path };
    }));
  };
  const read = async (x: File | string) => {
    setErr(null);
    try {
      const s = typeof x === 'string' ? x.trim() : '';
      if (s.startsWith('[') || s.startsWith('{')) {
        const j = JSON.parse(s); const rows: any[] = Array.isArray(j) ? j : [j];
        const fl = rows.map(r => flat(r)); const heads = Array.from(new Set(fl.flatMap(r => Object.keys(r))));
        load([heads, ...fl.map(r => heads.map(h => r[h]))]);
      } else if (typeof x !== 'string' && x.name.toLowerCase().endsWith('.json')) await read(await x.text());
      else load(await readTable(x));
    } catch (e: any) { setErr(`Could not read it: ${e?.message || e}`); }
  };
  const rows = (table || []).slice(1).filter(r => r.some(v => v !== null && v !== undefined && String(v).trim() !== ''));
  const nameCol = cols.findIndex(c => c.role === 'name');
  const used = cols.filter(c => (c.role === 'input' || c.role === 'expected') && c.path);
  const fresh = cols.filter(c => c.create && c.path && (c.role === 'input' || c.role === 'expected'));
  const go = useMutation({ meta: { silent: true },
    mutationFn: async () => {
      // words for columns that had none are made first
      if (fresh.length) {
        const sample = (ci: number) => rows.map(r => r[ci]).filter(v => v !== null && v !== undefined && String(v).trim() !== '');
        await api.post('/platform/vocabulary/bulk', { projectId, terms: fresh.map(c => { const vs = sample(cols.indexOf(c)); const numeric = vs.length > 0 && vs.every(v => !isNaN(Number(String(v).replace(/,/g, '')))); return { term: c.head.replace(/^(expected|exp)[\s_:.-]*/i, '').trim() || c.path, path: c.path, type: numeric ? 'number' : 'text' }; }) });
        qc.invalidateQueries({ queryKey: ['vocab', projectId] });
      }
      return api.post<{ created: number; updated: number }>('/platform/tests/import', { projectId, topicId, rows: rows.map((r, i) => {
      const input: any = {}; const expected: any = {};
      cols.forEach((c, ci) => { if (!c.path) return; const v = r[ci]; if (c.role === 'input' && v !== null && v !== undefined && v !== '') setPath(input, c.path, v); if (c.role === 'expected') expected[c.path] = v ?? ''; });
      return { name: nameCol >= 0 && r[nameCol] ? String(r[nameCol]) : `Case ${i + 1}`, input, expected };
    }) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['topic-tests'] }); qc.invalidateQueries({ queryKey: ['topics', projectId] }); qc.invalidateQueries({ queryKey: ['tests', projectId] }); qc.invalidateQueries({ queryKey: ['project-cases', projectId] }); onClose(); } });
  const opts = Array.from(targets) as [string, string][];
  // closing after rows were read asks first; Escape inside a picker never gets here
  const [asking, setAsking] = useState(false);
  const close = () => { if (table && rows.length && !go.isPending) setAsking(true); else onClose(); };
  const pasteIn = async () => { try { const t = await navigator.clipboard.readText(); if (t) setPaste(t); } catch { setErr('The browser did not allow reading the clipboard; use ⌘V / Ctrl+V in the box'); } };
  const set = (i: number, p: Partial<Col>) => setCols(cs => cs.map((c, k) => (k === i ? { ...c, ...p } : c)));
  const nExp = used.filter(c => c.role === 'expected').length;
  const th = 'h-10 px-3 text-left text-[12px] font-semibold bg-[#e0e0e0] whitespace-nowrap';
  const td = 'px-3 h-11 border-b border-[#e0e0e0] align-middle';

  return (
    <Modal title="Import test cases" wide="xl" onClose={close} onSubmit={table ? () => go.mutate() : () => read(paste)}
      submitLabel={go.isPending ? 'Importing…' : table ? `Add ${rows.length} case${rows.length === 1 ? '' : 's'}` : 'Read rows'}
      submitDisabled={go.isPending || (table ? !rows.length || !nExp : !paste.trim())} error={go.error ? String((go.error as any).message) : err}>
      {!table ? (
        <div className="grid gap-4">
          <DropZone accept=".xlsx,.csv,.tsv,.json" onFile={f => read(f)} label="Drop a sheet (.xlsx / .csv) whose first row names the columns, or a .json list of cases" />
          <div className="grid gap-1">
            <div className="flex items-end"><label htmlFor="ci-paste" className="flex-1 block text-[12px] text-[#525252]">Or paste rows copied from Excel, or a JSON list</label>
              <button type="button" className="h-8 px-3 text-[14px] text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={pasteIn}>Paste</button></div>
            <textarea id="ci-paste" rows={8} className="w-full bg-[#f4f4f4] border-b border-[#8d8d8d] px-3 py-2 text-[13px] font-mono focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2"
              value={paste} onChange={e => setPaste(e.target.value)} onPaste={e => { const t = e.clipboardData?.getData('text'); if (t) { e.preventDefault(); const el = e.currentTarget; const v = el.value; setPaste(v.slice(0, el.selectionStart) + t + v.slice(el.selectionEnd)); } }} />
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="text-[14px] text-[#161616]">{rows.length} row{rows.length === 1 ? '' : 's'} · {used.filter(c => c.role === 'input').length} input{used.filter(c => c.role === 'input').length === 1 ? '' : 's'} · {nExp} expected result{nExp === 1 ? '' : 's'}</div>
          <div className="max-h-[52vh] overflow-auto border border-[#e0e0e0]">
            <table className="w-full text-[14px]">
              <thead className="sticky top-0"><tr><th className={th}>Column</th><th className={th}>Example</th><th className={th}>Is</th><th className={th}>Word</th></tr></thead>
              <tbody>{cols.map((c, i) => (
                <tr key={i} className={c.role === 'skip' ? 'text-[#8d8d8d]' : ''}>
                  <td className={td}>{c.head || `Column ${i + 1}`}</td>
                  <td className={`${td} text-[#525252] truncate max-w-[180px]`}>{String(rows[0]?.[i] ?? '')}</td>
                  <td className={`${td} whitespace-nowrap`}><div role="radiogroup" aria-label={`${c.head} is`} className="inline-flex border border-[#8d8d8d]">{ROLES.map(o => (
                    <button key={o.value} type="button" role="radio" aria-checked={c.role === o.value} onClick={() => set(i, { role: o.value, ...((o.value === 'input' || o.value === 'expected') && !c.path ? { path: pathFor(c.head), create: true } : {}) })}
                      className={`h-8 px-2 text-[13px] ${c.role === o.value ? 'bg-[#393939] text-white' : 'text-[#161616] hover:bg-[#e8e8e8]'}`}>{o.label}</button>))}</div></td>
                  <td className={`${td} w-[280px]`}>{c.role === 'input' || c.role === 'expected' ? <WordPick value={c.path} create={c.create} head={c.head} options={opts} onChange={p => set(i, { path: p.path, create: !!p.create })} /> : null}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {fresh.length > 0 && <div className="text-[14px] text-[#161616]">{fresh.length} new word{fresh.length === 1 ? '' : 's'} will be made: {fresh.map(c => c.head).join(', ')}</div>}
          <button type="button" className="justify-self-start h-8 px-3 text-[14px] text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={() => { setTable(null); setCols([]); }}>Read other rows</button>
        </div>
      )}
      {asking && (
        <div role="alertdialog" aria-label="Discard the rows read" className="border-l-4 border-[#f1c21b] bg-[#fcf4d6] px-4 py-3 flex items-center gap-3"
          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setAsking(false); } }}>
          <span className="flex-1">Discard the {rows.length} rows read and the column choices?</span>
          <button type="button" autoFocus className="h-8 px-3 text-[14px] text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={() => setAsking(false)}>Keep</button>
          <button type="button" className="h-8 px-3 text-[14px] text-[#da1e28] hover:bg-[#fff1f1]" onClick={onClose}>Discard</button>
        </div>
      )}
    </Modal>
  );
}
