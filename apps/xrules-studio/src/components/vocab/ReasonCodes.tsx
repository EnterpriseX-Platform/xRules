'use client';
// The project's reason codes: code, text, outcome and priority (1 = most important). Decision lines add them
// with "then add reason"; the decision returns every code raised, the top one and its outcome.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Btn, DropZone, Input, Modal, Table, Td, TextArea } from '@/components/pipeline/ui';
import { ValueCombo } from '@/components/rule/ValueCombo';
import { readTable } from '@/lib/termImport';
import { usePerms } from '@/lib/perms';

export type Reason = { id: string; code: string; text: string; outcome: string; priority: number };
const SUGGESTED = ['Decline', 'Refer', 'Approve', 'Reject', 'Cancel', 'Pending'];
export const useReasons = (projectId?: string) => useQuery({ queryKey: ['reasons', projectId], queryFn: () => api.get<Reason[]>(`/platform/reasons?project_id=${projectId}`), enabled: !!projectId && !projectId.startsWith('_') });

type Row = { code: string; text: string; outcome: string; priority: string };
/** Columns code, text, outcome, priority: by header name when the first row has one, else in that order. */
function toRows(table: any[][]): Row[] {
  const cell = (v: any) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').trim());
  const head = (table[0] || []).map(h => cell(h).toLowerCase());
  const find = (re: RegExp) => head.findIndex(h => re.test(h));
  const hasHead = find(/code/) >= 0;
  const ix = hasHead ? { code: find(/code/), text: find(/text|description|reason|message/), outcome: find(/outcome|decision|result/), priority: find(/priority|order|rank/) } : { code: 0, text: 1, outcome: 2, priority: 3 };
  return (hasHead ? table.slice(1) : table).map(r => ({ code: cell(r[ix.code]), text: ix.text >= 0 ? cell(r[ix.text]) : '', outcome: ix.outcome >= 0 ? cell(r[ix.outcome]) : '', priority: ix.priority >= 0 ? cell(r[ix.priority]) : '' }))
    .filter(r => r.code || r.text);
}

function ImportReasons({ projectId, have, onClose }: { projectId: string; have: Reason[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [paste, setPaste] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const read = async (src: File | string) => { setErr(null); try { const r = toRows(await readTable(src, /code/i)); if (!r.length) throw new Error('No rows found'); setRows(r); } catch (e: any) { setErr(String(e?.message || e)); } };
  const bad = (r: Row) => !r.code ? 'No code' : !r.text ? 'No text' : r.priority && !/^-?\d+$/.test(r.priority) ? 'Priority is not a whole number' : rows!.filter(x => x.code === r.code).length > 1 ? 'Code twice' : '';
  const ok = rows?.filter(r => !bad(r)) || [];
  const go = useMutation({ meta: { silent: true }, mutationFn: () => api.post<{ created: number; updated: number }>('/platform/reasons/bulk', { projectId, rows: ok.map(r => ({ ...r, priority: r.priority === '' ? undefined : Number(r.priority) })) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reasons', projectId] }); onClose(); } });
  const neu = ok.filter(r => !have.some(h => h.code === r.code)).length;
  return (
    <Modal title="Import reason codes" wide="xl" onClose={onClose} onSubmit={rows ? () => go.mutate() : () => read(paste)}
      submitLabel={rows ? [neu ? `Add ${neu}` : '', ok.length - neu ? `update ${ok.length - neu}` : ''].filter(Boolean).join(', ').replace(/^u/, 'U') || 'Import' : 'Read rows'}
      submitDisabled={rows ? !ok.length || go.isPending : !paste.trim()} error={err || (go.error ? String((go.error as any).message) : null)}>
      {!rows ? (
        <div className="grid gap-4">
          <DropZone accept=".xlsx,.csv,.tsv,.txt" onFile={read} label="Drop an .xlsx or .csv file with columns code, text, outcome, priority" />
          <TextArea id="rc-paste" label="Or paste rows from Excel" rows={6} value={paste} onChange={setPaste} />
        </div>
      ) : (
        <div>
          <div className="text-[14px] text-[#525252] mb-2">{rows.length} row{rows.length === 1 ? '' : 's'} · {neu} new · {ok.length - neu} already in the list (updated){rows.length - ok.length ? ` · ${rows.length - ok.length} skipped` : ''} · <button className="text-[#0f62fe] hover:underline" onClick={() => setRows(null)}>Read again</button></div>
          <div className="max-h-[420px] overflow-auto border border-[#e0e0e0]">
            <Table head={['Code', 'Text', 'Outcome', 'Priority', '']}>
              {rows.map((r, i) => <tr key={i}><Td mono>{r.code}</Td><Td className="!whitespace-normal">{r.text}</Td><Td>{r.outcome || 'Decline'}</Td><Td>{r.priority || '100'}</Td>
                <Td className={bad(r) ? 'text-[#da1e28]' : 'text-[#525252]'}>{bad(r) || (have.some(h => h.code === r.code) ? 'Update' : 'New')}</Td></tr>)}
            </Table>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Outcome: any text, with the usual ones offered. */
function OutcomeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor="rc-out" className="block text-[12px] text-[#525252] mb-1.5">Outcome</label>
      <ValueCombo className="w-full h-10 px-4 bg-[#f4f4f4] border-b border-[#8d8d8d] text-[14px] outline-none focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2" placeholder="Decline"
        block ariaLabel="Outcome" value={value} values={SUGGESTED} onChange={onChange} />
    </div>
  );
}

export function ReasonCodes({ projectId }: { projectId: string }) {
  const qc = useQueryClient(); const perms = usePerms();
  const { data: rows = [] } = useReasons(projectId);
  const blank = { id: '', code: '', text: '', outcome: 'Decline', priority: '' };
  const [f, setF] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const done = () => qc.invalidateQueries({ queryKey: ['reasons', projectId] });
  const save = useMutation({ meta: { silent: true }, mutationFn: () => api.post('/platform/reasons', { projectId, id: f.id || undefined, code: f.code, text: f.text, outcome: f.outcome, priority: String(f.priority).trim() === '' ? undefined : Number(f.priority) }), onSuccess: () => { done(); setF(null); } });
  const remove = useMutation({ mutationFn: (id: string) => api.post(`/platform/reasons/${id}/remove`), onSuccess: done });
  const edit = (r: Reason) => { save.reset(); setF({ ...r, priority: String(r.priority) }); };
  return (
    <div className="space-y-4">
      {perms.write && <div className="flex gap-2"><Btn onClick={() => { save.reset(); setF(blank); }}>Add reason</Btn><Btn kind="tertiary" onClick={() => setImporting(true)}>Import</Btn></div>}
      {importing && <ImportReasons projectId={projectId} have={rows} onClose={() => setImporting(false)} />}
      <Table head={['Code', 'Text', 'Outcome', 'Priority', '']}>
        {rows.map(r => (
          <tr key={r.id} className="cursor-pointer hover:bg-[#f4f4f4]" onClick={() => perms.write && edit(r)}>
            <Td mono>{r.code}</Td><Td className="!whitespace-normal">{r.text}</Td><Td>{r.outcome}</Td><Td>{r.priority}</Td>
            <Td className="whitespace-nowrap">{perms.write && <><button className="h-8 px-3 text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={e => { e.stopPropagation(); edit(r); }}>Edit</button><button className="h-8 px-3 text-[#da1e28] hover:bg-[#fff1f1]" onClick={e => { e.stopPropagation(); remove.mutate(r.id); }}>Remove</button></>}</Td>
          </tr>
        ))}
      </Table>
      {f && (
        <Modal title={f.id ? 'Edit reason' : 'Add reason'} onClose={() => setF(null)} onSubmit={() => save.mutate()} submitLabel={f.id ? 'Save' : 'Add'}
          submitDisabled={!f.code.trim() || !f.text.trim() || save.isPending || (String(f.priority).trim() !== '' && !/^-?\d+$/.test(String(f.priority).trim()))} error={save.error ? String((save.error as any).message) : null}>
          <div className="grid gap-4">
            <Input id="rc-code" label="Code" mono value={f.code} onChange={(v: string) => setF({ ...f, code: v })} placeholder="B001" />
            <Input id="rc-text" label="Reason text" value={f.text} onChange={(v: string) => setF({ ...f, text: v })} placeholder="Bankruptcy flag" />
            <OutcomeInput value={f.outcome} onChange={v => setF({ ...f, outcome: v })} />
            <Input id="rc-prio" label="Priority (1 = most important)" value={f.priority} onChange={(v: string) => setF({ ...f, priority: v })} placeholder="100" />
          </div>
        </Modal>
      )}
    </div>
  );
}
