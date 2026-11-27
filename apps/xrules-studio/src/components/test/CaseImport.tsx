'use client';
// Bring in many test cases at once: a dropped .xlsx / .csv / .json, or rows pasted from Excel or a JSON array.
// Each column is matched to a word by data path or name; a column is an input (what the applicant brings) or an
// expected result (what the topic should answer). Unmatched columns can be pointed at a word or left out.
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DropZone, Modal, TextArea } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';
import { readTable } from '@/lib/termImport';
import { useTerms } from '@/lib/terms';

type Col = { head: string; role: 'input' | 'expected' | 'name' | 'skip'; path: string };
const RESULTS = [{ path: 'outcome', name: 'Final decision' }, { path: 'reason', name: 'Final reason' }, { path: 'reasons', name: 'All reasons' }, { path: 'reasonText', name: 'Reason text' }];
const NON = new RegExp('[^\\p{L}\\p{N}]+', 'gu');
const norm = (s: string) => String(s ?? '').toLowerCase().replace(NON, '');

function setPath(o: any, path: string, v: any) {
  const ks = path.split('.'); let cur = o;
  ks.slice(0, -1).forEach(k => { cur[k] = cur[k] && typeof cur[k] === 'object' ? cur[k] : {}; cur = cur[k]; });
  cur[ks[ks.length - 1]] = v;
}
const flat = (o: any, p = ''): Record<string, any> => (o && typeof o === 'object' && !Array.isArray(o) ? Object.entries(o).reduce((a, [k, v]) => ({ ...a, ...flat(v, p ? `${p}.${k}` : k) }), {}) : { [p]: o });

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
    return m;
  }, [terms, outputs]);
  const match = (h: string) => {
    const n = norm(h.replace(/^(expected|exp)[\s_:.-]*/i, ''));
    for (const [p, name] of Array.from(targets)) if (norm(p) === n || norm(name) === n || norm(p.split('.').pop() || '') === n) return p;
    return '';
  };
  const outputSet = new Set([...RESULTS, ...outputs].map(o => o.path));
  const load = (t: any[][]) => {
    if (!t.length || !t[0]?.length) throw new Error('Nothing to read');
    setTable(t);
    setCols((t[0] || []).map((h: any) => {
      const head = String(h ?? '').trim(); const path = match(head);
      const role: Col['role'] = /^(name|case|case ?id|test ?case|no\.?)$/i.test(head) ? 'name' : /^(expected|exp)\b/i.test(head) || outputSet.has(path) ? 'expected' : path ? 'input' : 'skip';
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
  const go = useMutation({ meta: { silent: true },
    mutationFn: () => api.post<{ created: number; updated: number }>('/platform/tests/import', { projectId, topicId, rows: rows.map((r, i) => {
      const input: any = {}; const expected: any = {};
      cols.forEach((c, ci) => { if (!c.path) return; const v = r[ci]; if (c.role === 'input' && v !== null && v !== undefined && v !== '') setPath(input, c.path, v); if (c.role === 'expected') expected[c.path] = v ?? ''; });
      return { name: nameCol >= 0 && r[nameCol] ? String(r[nameCol]) : `Case ${i + 1}`, input, expected };
    }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['topic-tests'] }); qc.invalidateQueries({ queryKey: ['topics', projectId] }); qc.invalidateQueries({ queryKey: ['tests', projectId] }); qc.invalidateQueries({ queryKey: ['project-cases', projectId] }); onClose(); } });
  const opts = [{ value: '', label: 'Choose a word' }, ...Array.from(targets).map(([p, n]) => ({ value: p, label: n }))];
  const set = (i: number, p: Partial<Col>) => setCols(cs => cs.map((c, k) => (k === i ? { ...c, ...p } : c)));
  const nExp = used.filter(c => c.role === 'expected').length;
  const th = 'h-10 px-3 text-left text-[12px] font-semibold bg-[#e0e0e0] whitespace-nowrap';
  const td = 'px-3 h-11 border-b border-[#e0e0e0] align-middle';

  return (
    <Modal title="Import test cases" wide="xl" onClose={onClose} onSubmit={table ? () => go.mutate() : () => read(paste)}
      submitLabel={go.isPending ? 'Importing…' : table ? `Add ${rows.length} case${rows.length === 1 ? '' : 's'}` : 'Read rows'}
      submitDisabled={go.isPending || (table ? !rows.length || !nExp : !paste.trim())} error={go.error ? String((go.error as any).message) : err}>
      {!table ? (
        <div className="grid gap-4">
          <DropZone accept=".xlsx,.csv,.tsv,.json" onFile={f => read(f)} label="Drop a sheet (.xlsx / .csv) whose first row names the columns, or a .json list of cases" />
          <TextArea id="ci-paste" label="Or paste rows copied from Excel, or a JSON list" rows={8} value={paste} onChange={setPaste} />
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
                  <td className={`${td} w-[170px]`}><Dropdown value={c.role} onChange={v => set(i, { role: v as Col['role'] })} options={[{ value: 'input', label: 'Input' }, { value: 'expected', label: 'Expected result' }, { value: 'name', label: 'Case name' }, { value: 'skip', label: 'Leave out' }]} /></td>
                  <td className={`${td} w-[260px]`}>{c.role === 'input' || c.role === 'expected' ? <Dropdown value={c.path} onChange={v => set(i, { path: v })} options={opts} /> : null}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <button type="button" className="justify-self-start h-8 px-3 text-[14px] text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={() => { setTable(null); setCols([]); }}>Read other rows</button>
        </div>
      )}
    </Modal>
  );
}
