'use client';
// The topic's test cases beside the editor: run the whole topic for each case after every save and show pass / fail,
// what came out against what was expected, and which lines of which decision fired.
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Tick } from '@/lib/tick';
import { useTerms } from '@/lib/terms';
import { CaseImport } from '@/components/test/CaseImport';
import { useBulkRemove, RemovedCell } from '@/lib/listRemove';

const show = (v: any) => (v === null || v === undefined || v === '' ? '—' : Array.isArray(v) ? (v.length ? v.join(' ') : '—') : typeof v === 'object' ? JSON.stringify(v) : String(v));

export function TopicTests({ projectId, topicId, runKey, focusId, canWrite = true, outputs, staleSince }: {
  projectId: string; topicId: string; runKey?: any; focusId?: string; canWrite?: boolean; outputs?: { path: string; name: string }[]; staleSince?: string;
}) {
  const qc = useQueryClient();
  const { label } = useTerms(projectId);
  const [openSet, setOpenSet] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);
  const [asTable, setAsTable] = useState(false);
  const isOpen = (id: string) => all || openSet.has(id);
  const toggle = (id: string) => setOpenSet(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [importing, setImporting] = useState(false);
  const { data: cases = [] } = useQuery({ queryKey: ['topic-tests', topicId], queryFn: () => api.get<any[]>(`/platform/tests/target/topic/${topicId}`) });
  const run = useMutation({ meta: { failLabel: "Couldn't run" }, mutationFn: () => api.post<any>(`/platform/topics/${topicId}/tests/run`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['topic-tests', topicId] }); qc.invalidateQueries({ queryKey: ['topics', projectId] }); } });
  // run again a moment after each save
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } if (!(cases as any[]).length) return; const t = setTimeout(() => run.mutate(), 900); return () => clearTimeout(t); }, [runKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // the decision or calculation changed after the cases last ran (also when this panel was just opened again)
  const staleRun = useRef<string | null>(null);
  useEffect(() => {
    const all = cases as any[]; if (!staleSince || !all.length || run.isPending || staleRun.current === staleSince) return;
    if (all.some(c => !c.updatedAt || c.updatedAt < staleSince)) { staleRun.current = staleSince; const t = setTimeout(() => run.mutate(), 900); return () => clearTimeout(t); }
  }, [staleSince, cases]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownCases = cases as any[];
  const list = shownCases.filter(c => !c._removed);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const bulk = useBulkRemove<any>({ queryKey: ['topic-tests', topicId], also: [['topics', projectId]], noun: 'test case',
    remove: rows => api.post('/platform/tests/remove', { ids: rows.map(r => r.id) }), restore: rows => api.post('/platform/tests/restore', { ids: rows.map(r => r.id) }) });
  const pickedLive = list.filter(c => picked.has(c.id));
  // per expected field: how many of the cases that were run match it
  const fields: { path: string; ok: number; of: number }[] = [];
  for (const c of list) {
    const checks: any[] = c.lastResult?.checks || [];
    (c.expectations || []).forEach((e: any, i: number) => {
      if (!e?.path || !checks[i]) return;
      let f = fields.find(x => x.path === e.path); if (!f) fields.push(f = { path: e.path, ok: 0, of: 0 });
      f.of++; if (checks[i].ok) f.ok++;
    });
  }
  const pass = list.filter(c => c.lastStatus === 'PASS').length; const fail = list.filter(c => c.lastStatus === 'FAIL' || c.lastStatus === 'ERROR').length;

  return (
    <section className="bg-white border border-[#e0e0e0] min-w-0 max-w-full overflow-hidden">
      <div className="flex items-center gap-2 px-4 h-12 border-b border-[#e0e0e0]">
        <h2 className="m-0 flex-1 text-[14px] font-semibold text-[#161616]">Test cases</h2>
        {list.length > 0 && <span className="text-[13px] tabular-nums text-[#525252]">{run.isPending ? 'Running…' : <><span className="text-[#198038]">{pass} pass</span>{fail ? <> · <span className="text-[#da1e28]">{fail} fail</span></> : null}</>}</span>}
        {list.length > 0 && <button type="button" className="h-8 px-3 text-[14px] text-[#0f62fe] hover:bg-[#e8e8e8] disabled:text-[#8d8d8d]" disabled={run.isPending} onClick={() => run.mutate()}>Run</button>}
        {canWrite && <button type="button" className="h-8 px-3 text-[14px] text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={() => setImporting(true)}>Import</button>}
      </div>
      {canWrite && list.length > 0 && (
        <div className="flex items-center gap-2 px-4 h-10 border-b border-[#e0e0e0] text-[13px]">
          <label className="flex items-center gap-2 flex-1 cursor-pointer"><Tick aria-label="Select all test cases"
            checked={pickedLive.length === list.length} indeterminate={pickedLive.length > 0 && pickedLive.length < list.length}
            onSet={on => setPicked(on ? new Set(list.map(c => c.id)) : new Set())} />{pickedLive.length ? `${pickedLive.length} selected` : 'Select'}</label>
          {pickedLive.length > 0 && <button type="button" disabled={bulk.busy} className="h-8 px-3 text-[#da1e28] hover:bg-[#fff1f1] disabled:text-[#8d8d8d]" onClick={() => { bulk.removeMany(pickedLive); setPicked(new Set()); }}>Remove {pickedLive.length}</button>}
        </div>
      )}
      {!list.length && <div className="px-4 py-4 text-[14px] text-[#6f6f6f]">No test cases yet</div>}
      {fields.length > 0 && (
        <div className="px-4 py-2 border-b border-[#e0e0e0] text-[13px]">
          {fields.map(f => <div key={f.path} className="grid grid-cols-[1fr_auto] gap-x-3 h-7 items-center"><span className="text-[#525252] truncate">{label(String(f.path).replace(/^\$\.?/, ''))}</span>
            <span className={`tabular-nums ${f.ok === f.of ? 'text-[#198038]' : 'text-[#da1e28]'}`}>matched {f.ok} of {f.of}</span></div>)}
          <div className="flex gap-1 pt-1">
            <button type="button" className="h-8 px-2 text-[13px] text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={() => { setAsTable(false); setAll(a => !a); setOpenSet(new Set()); }}>{all ? 'Collapse all' : 'Expand all'}</button>
            <button type="button" className="h-8 px-2 text-[13px] text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={() => setAsTable(t => !t)}>{asTable ? 'Show as list' : 'Show as table'}</button>
          </div>
        </div>
      )}
      {asTable && fields.length > 0 && (
        <div className="max-h-[70vh] max-w-full overflow-auto">
          <table className="text-[13px] border-collapse">
            <thead className="sticky top-0 bg-[#e0e0e0]"><tr><th className="h-9 px-3 text-left font-semibold whitespace-nowrap">Case</th>{fields.map(f => <th key={f.path} className="h-9 px-3 text-left font-semibold whitespace-nowrap">{label(String(f.path).replace(/^\$\.?/, ''))}</th>)}</tr></thead>
            <tbody>{list.map(c => { const r = c.lastResult || {}; return (
              <tr key={c.id} className="border-b border-[#e0e0e0]"><td className="h-9 px-3 whitespace-nowrap">{c.name}</td>
                {fields.map(f => { const i = (c.expectations || []).findIndex((e: any) => e?.path === f.path); const k = i >= 0 ? (r.checks || [])[i] : null; const e = i >= 0 ? c.expectations[i] : null;
                  return <td key={f.path} className={`h-9 px-3 whitespace-nowrap ${!k ? 'text-[#8d8d8d]' : k.ok ? 'text-[#198038]' : 'text-[#da1e28]'}`}>{!k ? '—' : k.ok ? show(e.value) : `${show(readPath(r.output, e.path))} · expected ${show(e.value)}`}</td>; })}
              </tr>); })}</tbody>
          </table>
        </div>
      )}
      {!asTable && <div className="max-h-[70vh] overflow-auto">
        {shownCases.map(c => {
          if (c._removed) return <div key={c.id} className="flex items-center gap-3 px-4 h-10 border-b border-[#e0e0e0] text-[14px] text-[#8d8d8d]"><span className="flex-1 truncate line-through">{c.name}</span><RemovedCell onUndo={() => bulk.undoOne(c)} /></div>;
          const r = c.lastResult || {}; const bad = c.lastStatus === 'FAIL' || c.lastStatus === 'ERROR';
          const trace: any[] = r.output?._trace || [];
          const here = focusId ? trace.find(t => t.id === focusId) : null;
          return (
            <div key={c.id} className="border-b border-[#e0e0e0] last:border-b-0">
              <div className="flex items-center">
              {canWrite && <Tick className="ml-4 h-4 w-4 shrink-0 accent-[#161616]" aria-label={`Select ${c.name}`} checked={picked.has(c.id)} onSet={on => setPicked(s => { const n = new Set(s); on ? n.add(c.id) : n.delete(c.id); return n; })} />}
              <button type="button" className="flex-1 min-w-0 flex items-center gap-3 px-4 h-10 text-left hover:bg-[#f4f4f4]" onClick={() => toggle(c.id)} aria-expanded={isOpen(c.id)}>
                <span className={`w-12 text-[13px] ${c.lastStatus === 'PASS' ? 'text-[#198038]' : bad ? 'text-[#da1e28]' : 'text-[#6f6f6f]'}`}>{c.lastStatus === 'PASS' ? 'Pass' : c.lastStatus === 'ERROR' ? 'Error' : bad ? 'Fail' : 'Not run'}</span>
                <span className="flex-1 truncate text-[14px] text-[#161616]">{c.name}</span>
                {here?.lines?.length ? <span className="text-[12px] text-[#525252] tabular-nums">{here.lines.map((n: number, k: number) => `line ${n}${here.from?.[k] ? ` · ${here.from[k]}` : ''}`).join(', ')}</span> : null}
              </button>
              </div>
              {isOpen(c.id) && (
                <div className="px-4 pb-3 text-[13px] space-y-2">
                  {(r.checks || []).map((k: any, i: number) => {
                    const e = (c.expectations || [])[i];
                    return e?.path ? (
                      <div key={i} className="grid grid-cols-[1fr_auto] gap-x-3">
                        <span className="text-[#525252]">{label(String(e.path).replace(/^\$\.?/, ''))}</span>
                        <span className={k.ok ? 'text-[#198038]' : 'text-[#da1e28]'}>{k.ok ? show(e.value) : `${show(readPath(r.output, e.path))} · expected ${show(e.value)}`}</span>
                      </div>
                    ) : <div key={i} className="text-[#da1e28]">{k.message}</div>;
                  })}
                  {trace.length > 0 && <div className="pt-1 text-[#525252]">{trace.map(t => <div key={t.id} className={t.id === focusId ? 'text-[#161616]' : ''}>{t.name}: {t.error ? <span className="text-[#da1e28]">{t.error}</span> : t.lines ? (t.lines.length ? t.lines.map((n: number, k: number) => `line ${n}${t.from?.[k] ? ` (${t.from[k]})` : ''}`).join(', ') : 'no line') : workedOut(t.output, label)}</div>)}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>}
      {importing && <CaseImport projectId={projectId} topicId={topicId} outputs={outputs} onClose={() => setImporting(false)} />}
    </section>
  );
}
const readPath = (o: any, p: string) => String(p).replace(/^\$\.?/, '').split('.').filter(Boolean).reduce((a, k) => a?.[k], o);
/** What a calculation worked out for this case: "employee income 36,600 · ever reject 1". */
function workedOut(o: any, label: (p: string) => string) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return show(o);
  const xs = Object.entries(o).filter(([k]) => !k.startsWith('_'));
  if (!xs.length) return 'nothing worked out';
  return xs.map(([k, v]) => `${label(k)} ${typeof v === 'number' ? (Math.round(v * 1e6) / 1e6).toLocaleString('en-US') : show(v)}`).join(' · ');
}
