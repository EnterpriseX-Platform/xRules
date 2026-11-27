'use client';
// Import terms from a sample: a dropped .json / .xlsx / .csv file or pasted JSON. Every field path is proposed
// as a term with a type read from the values; the user unticks or renames, then all are created in one call.
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Btn, DropZone, Modal, Notice, TextArea } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';
import { propose, readSample, type Proposed } from '@/lib/termImport';

const TYPES = [{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'money', label: 'Money' }, { value: 'date', label: 'Date' }, { value: 'boolean', label: 'Yes / no' }, { value: 'enum', label: 'List of values' }];

export function ImportTerms({ projectId, known, onClose }: { projectId: string; known: { path: string; term: string }[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Proposed[] | null>(null);
  const [paste, setPaste] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [source, setSource] = useState('');
  const read = async (x: File | string) => {
    setErr(null);
    try { const sample = await readSample(x); const p = propose(sample, known); if (!p.length) throw new Error('No fields found'); setRows(p); setSource(typeof x === 'string' ? 'pasted JSON' : x.name); }
    catch (e: any) { setErr(`Could not read it: ${e?.message || e}`); }
  };
  const picked = (rows || []).filter(r => r.keep);
  const save = useMutation({ meta: { silent: true },
    mutationFn: () => api.post<{ created: number }>('/platform/vocabulary/bulk', { projectId, terms: picked.map(r => ({ term: r.term.trim(), path: r.path, type: r.type, values: r.type === 'enum' ? r.values : [] })) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vocab', projectId] }); qc.invalidateQueries({ queryKey: ['vocab-sug', projectId] }); onClose(); } });
  const set = (i: number, p: Partial<Proposed>) => setRows(rs => rs!.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const dup = new Set(picked.map(r => r.term.trim().toLowerCase()).filter((t, i, a) => a.indexOf(t) !== i));
  const taken = picked.filter(r => known.some(k => k.term.toLowerCase() === r.term.trim().toLowerCase() && k.path !== r.path)).map(r => r.term.trim());
  const th = 'h-10 px-3 text-left text-[12px] font-semibold bg-[#e0e0e0] whitespace-nowrap';
  const td = 'px-3 h-11 border-b border-[#e0e0e0] align-middle';

  return (
    <Modal title="Import terms" wide="xl" onClose={onClose} onSubmit={rows ? () => save.mutate() : undefined}
      submitLabel={rows ? `Add ${picked.length} term${picked.length === 1 ? '' : 's'}` : 'Add'} submitDisabled={!rows || !picked.length || save.isPending || dup.size > 0 || taken.length > 0 || picked.some(r => !r.term.trim())}
      error={save.error ? String((save.error as any).message) : err}>
      {!rows ? (
        <div className="grid gap-4">
          <DropZone accept=".json,.xlsx,.csv" onFile={f => read(f)} label="Drop a sample request (.json), or a sheet whose first row names the fields (.xlsx / .csv)" />
          <TextArea id="imp-json" label="Or paste a JSON sample" rows={8} value={paste} onChange={setPaste} />
          <div><Btn kind="tertiary" type="button" disabled={!paste.trim()} onClick={() => read(paste)}>Read fields</Btn></div>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="flex items-center gap-4 text-[14px]">
            <span className="flex-1 text-[#525252]">{rows.length} fields from {source} · {picked.length} selected</span>
            <button type="button" className="text-[#0f62fe] hover:underline" onClick={() => setRows(rs => rs!.map(r => ({ ...r, keep: true })))}>Select all</button>
            <button type="button" className="text-[#0f62fe] hover:underline" onClick={() => setRows(rs => rs!.map(r => ({ ...r, keep: false })))}>Clear</button>
            <button type="button" className="text-[#0f62fe] hover:underline" onClick={() => setRows(null)}>Other sample</button>
          </div>
          {taken.length > 0 && <Notice kind="error">Already a term for another field: {taken.join(', ')}</Notice>}
          {dup.size > 0 && <Notice kind="error">Two selected rows have the same term: {Array.from(dup).join(', ')}</Notice>}
          <div className="max-h-[56vh] overflow-auto border border-[#e0e0e0] bg-white">
            <table className="w-full text-[14px]">
              <thead className="sticky top-0 z-10"><tr><th className={`${th} w-10`} /><th className={th}>Term</th><th className={th}>Data path</th><th className={`${th} w-[180px]`}>Type</th><th className={th}>Sample values</th></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const exists = known.some(k => k.path === r.path);
                  return (
                    <tr key={r.path} className={r.keep ? '' : 'text-[#8d8d8d]'}>
                      <td className={td}><input type="checkbox" aria-label={`Import ${r.path}`} checked={r.keep} onChange={e => set(i, { keep: e.target.checked })} /></td>
                      <td className={td}><input aria-label={`Term for ${r.path}`} className="h-8 w-full min-w-[180px] px-2 bg-[#f4f4f4] border-b border-[#8d8d8d] outline-none focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2" value={r.term} onChange={e => set(i, { term: e.target.value })} /></td>
                      <td className={`${td} font-mono text-[13px]`}>{r.path}{exists && <span className="ml-2 font-sans text-[12px] text-[#6f6f6f]">has a term</span>}</td>
                      <td className={td}><Dropdown value={r.type} options={TYPES} onChange={v => set(i, { type: v })} /></td>
                      <td className={`${td} text-[13px] text-[#525252] max-w-[280px] truncate`} title={r.type === 'enum' ? r.values.join(', ') : r.samples.join(', ')}>{r.type === 'enum' ? r.values.join(', ') : r.samples.join(', ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
