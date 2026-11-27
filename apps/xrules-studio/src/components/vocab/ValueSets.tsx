'use client';
// Value sets: the possible values of words — code · label · extra columns (C003 · Retail · margin 0.3) and named groups.
// Made from a dropped sheet or pasted rows, edited row by row; several words can use one set.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Btn, DropZone, Input, Modal, Notice, Table, Td } from '@/components/pipeline/ui';
import { Chip } from '@/components/links/Links';
import { useListRemove, RemovedCell } from '@/lib/listRemove';
import { readTable } from '@/lib/termImport';

type Row = { code: string; label: string; extra: Record<string, any> };
type VSet = { id: string; name: string; columns: string[]; rows: Row[]; groups: Record<string, string[]>; version: number; words?: { id: string; term: string }[] };

/** Rows from a sheet: a first row naming Code / Label (and extra columns) is read as the header. */
export function rowsFromTable(table: any[][]): { columns: string[]; rows: Row[] } {
  const t = table.filter(r => r && r.some((c: any) => String(c ?? '').trim() !== ''));
  if (!t.length) return { columns: [], rows: [] };
  const head = t[0].map((h: any) => String(h ?? '').trim());
  const hasHead = /^code$/i.test(head[0] || '') || /^label|name|description$/i.test(head[1] || '');
  const columns = hasHead ? head.slice(2).filter(Boolean) : t[0].slice(2).map((_: any, i: number) => `column ${i + 1}`);
  const rows = (hasHead ? t.slice(1) : t).map(r => ({ code: String(r[0] ?? '').trim(), label: String(r[1] ?? r[0] ?? '').trim(),
    extra: Object.fromEntries(columns.map((c, i) => [c, r[i + 2] ?? null])) })).filter(r => r.code);
  return { columns, rows };
}

export function ValueSets({ projectId }: { projectId: string }) {
  const { data: sets = [] } = useQuery({ queryKey: ['value-sets', projectId], queryFn: () => api.get<VSet[]>(`/platform/value-sets?project_id=${projectId}`) });
  const [open, setOpen] = useState<VSet | 'new' | null>(null);
  const del = useListRemove<VSet>({ queryKey: ['value-sets', projectId], also: [['vocab', projectId]], noun: 'value set', name: s => `"${s.name}"`,
    remove: s => api.post(`/platform/value-sets/${s.id}/remove`, {}), restore: s => api.post(`/platform/value-sets/${s.id}/restore`, {}) });
  return (
    <div className="space-y-4">
      <div className="flex gap-2"><Btn onClick={() => setOpen('new')}>Add value set</Btn></div>
      {open && <SetForm projectId={projectId} set={open === 'new' ? null : open} onClose={() => setOpen(null)} />}
      <Table head={['Value set', 'Values', 'Extra columns', 'Groups', 'Words using it', 'Version', '']} empty={<span className="text-[#6f6f6f]">No value sets yet</span>}>
        {(sets as VSet[]).map(s => (
          <tr key={s.id} className={del.isRemoved(s) ? 'text-[#8d8d8d] [&>td:not(:last-child)]:line-through' : 'cursor-pointer hover:bg-[#f4f4f4]'} onClick={() => !del.isBusy(s) && !del.isRemoved(s) && setOpen(s)}>
            <Td>{s.name}</Td>
            <Td className="!whitespace-normal">{s.rows.length.toLocaleString()}<div className="text-[12px] text-[#525252]">{s.rows.slice(0, 4).map(r => `${r.code} ${r.label}`).join(' · ')}{s.rows.length > 4 ? ' …' : ''}</div></Td>
            <Td>{s.columns.join(', ') || <span className="text-[#6f6f6f]">None</span>}</Td>
            <Td>{Object.keys(s.groups || {}).join(', ') || <span className="text-[#6f6f6f]">None</span>}</Td>
            <Td>{s.words?.length ? s.words.map(w => w.term).join(', ') : <span className="text-[#6f6f6f]">Not used yet</span>}</Td>
            <Td>{s.version}</Td>
            <Td className="whitespace-nowrap">{del.isRemoved(s) ? <RemovedCell onUndo={() => del.undo(s)} /> : <>
              <button className="h-8 px-3 text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={e => { e.stopPropagation(); setOpen(s); }}>Edit</button>
              <button className="h-8 px-3 text-[#da1e28] hover:bg-[#fff1f1] disabled:text-[#8d8d8d]" disabled={del.isBusy(s)} onClick={e => { e.stopPropagation(); del.request(s); }}>Remove</button></>}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

const cell = 'h-8 w-full px-2 bg-[#f4f4f4] border-b border-[#8d8d8d] outline-none focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2';

function SetForm({ projectId, set, onClose }: { projectId: string; set: VSet | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(set?.name || '');
  const [columns, setColumns] = useState<string[]>(set?.columns || []);
  const [rows, setRows] = useState<Row[]>(set?.rows || []);
  const [groups, setGroups] = useState<{ name: string; codes: string }[]>(Object.entries(set?.groups || {}).map(([n, c]) => ({ name: n, codes: c.join(', ') })));
  const [paste, setPaste] = useState(''); const [err, setErr] = useState<string | null>(null);
  const [newCol, setNewCol] = useState('');
  const { data: usage } = useQuery({ queryKey: ['value-set-usage', set?.id], enabled: !!set?.id, queryFn: () => api.get<any>(`/platform/value-sets/${set!.id}/usage`) });
  const take = async (x: File | string) => {
    setErr(null);
    try { const r = rowsFromTable(await readTable(x)); if (!r.rows.length) throw new Error('No rows found'); setColumns(c => Array.from(new Set([...c, ...r.columns]))); setRows(r.rows); setPaste(''); }
    catch (e: any) { setErr(`Could not read it: ${e?.message || e}`); }
  };
  const save = useMutation({ meta: { silent: true },
    mutationFn: () => api.post('/platform/value-sets', { id: set?.id, projectId, name, columns, rows,
      groups: Object.fromEntries(groups.filter(g => g.name.trim()).map(g => [g.name.trim(), g.codes.split(',').map(s => s.trim()).filter(Boolean)])) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['value-sets', projectId] }); qc.invalidateQueries({ queryKey: ['vocab', projectId] }); onClose(); } });
  const setRow = (i: number, p: Partial<Row>) => setRows(rs => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const dup = rows.map(r => r.code.trim()).filter((c, i, a) => c && a.indexOf(c) !== i);
  const th = 'h-10 px-2 text-left text-[12px] font-semibold bg-[#e0e0e0] whitespace-nowrap';
  return (
    <Modal title={set ? `Value set ${set.name}` : 'Add value set'} wide="xl" onClose={onClose} onSubmit={() => save.mutate()} submitLabel={set ? 'Save' : 'Add'}
      submitDisabled={!name.trim() || !rows.length || dup.length > 0 || save.isPending} error={save.error ? String((save.error as any).message) : err}>
      <Input id="vs-name" label="Name" value={name} onChange={setName} placeholder="Business types" />
      <DropZone accept=".xlsx,.csv" onFile={f => take(f)} label="Drop a sheet: code, label, then any extra columns (first row may name them)" />
      <div className="flex gap-2 items-start">
        <textarea aria-label="Or paste rows" placeholder={'Or paste rows copied from Excel\nC003\tRetail\t0.3'} value={paste} onChange={e => setPaste(e.target.value)}
          className="flex-1 h-20 px-3 py-2 bg-[#f4f4f4] border-b border-[#8d8d8d] text-[13px] font-mono outline-none focus:outline focus:outline-2 focus:outline-[#0f62fe]" />
        <Btn kind="tertiary" type="button" disabled={!paste.trim()} onClick={() => take(paste)}>Read rows</Btn>
      </div>
      {dup.length > 0 && <Notice kind="error">Code {dup[0]} is listed twice</Notice>}
      <div className="max-h-[40vh] overflow-auto border border-[#e0e0e0] bg-white">
        <table className="w-full text-[14px]">
          <thead className="sticky top-0 z-10"><tr><th className={`${th} w-[140px]`}>Code</th><th className={th}>Label</th>
            {columns.map(c => <th key={c} className={th}>{c}<button type="button" aria-label={`Remove column ${c}`} className="ml-2 text-[#8d8d8d] hover:text-[#da1e28]" onClick={() => setColumns(cs => cs.filter(x => x !== c))}>×</button></th>)}
            <th className={`${th} w-10`} /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-[#e0e0e0]">
                <td className="px-2 py-1"><input aria-label={`Code ${i + 1}`} className={`${cell} font-mono`} value={r.code} onChange={e => setRow(i, { code: e.target.value })} /></td>
                <td className="px-2 py-1"><input aria-label={`Label ${i + 1}`} className={cell} value={r.label} onChange={e => setRow(i, { label: e.target.value })} /></td>
                {columns.map(c => <td key={c} className="px-2 py-1"><input aria-label={`${c} ${i + 1}`} className={`${cell} text-right`} value={r.extra?.[c] ?? ''} onChange={e => setRow(i, { extra: { ...r.extra, [c]: e.target.value } })} /></td>)}
                <td className="px-1"><button type="button" aria-label={`Remove ${r.code || 'row'}`} className="h-8 w-8 text-[#8d8d8d] hover:text-[#da1e28]" onClick={() => setRows(rs => rs.filter((_, k) => k !== i))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-4 items-end">
        <button type="button" className="h-8 text-[#0f62fe] hover:underline" onClick={() => setRows(rs => [...rs, { code: '', label: '', extra: {} }])}>Add value</button>
        <span className="flex items-end gap-2"><Input id="vs-col" label="Extra column" value={newCol} onChange={setNewCol} placeholder="margin" />
          <Btn kind="ghost" type="button" disabled={!newCol.trim() || columns.includes(newCol.trim())} onClick={() => { setColumns(c => [...c, newCol.trim()]); setNewCol(''); }}>Add column</Btn></span>
      </div>
      <div>
        <div className="text-[14px] mb-2">Groups</div>
        {groups.map((g, i) => (
          <div key={i} className="grid grid-cols-[200px_1fr_auto] gap-2 mb-2">
            <input aria-label="Group name" placeholder="Prohibited" className={cell} value={g.name} onChange={e => setGroups(gs => gs.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
            <input aria-label={`Codes in ${g.name || 'group'}`} placeholder="C009, C011" className={`${cell} font-mono`} value={g.codes} onChange={e => setGroups(gs => gs.map((x, k) => (k === i ? { ...x, codes: e.target.value } : x)))} />
            <button type="button" aria-label="Remove group" className="h-8 w-8 text-[#8d8d8d] hover:text-[#da1e28]" onClick={() => setGroups(gs => gs.filter((_, k) => k !== i))}>×</button>
          </div>
        ))}
        <button type="button" className="h-8 text-[#0f62fe] hover:underline" onClick={() => setGroups(gs => [...gs, { name: '', codes: '' }])}>Add group</button>
      </div>
      {set && <div>
        <div className="text-[14px] mb-2">Where used</div>
        {!usage ? null : !usage.words.length ? <span className="text-[#6f6f6f]">No word uses this set yet</span> : <div className="space-y-1 text-[14px]">
          <div>Words: {usage.words.map((w: any) => w.term).join(', ')}</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">Decisions: {usage.decisions.length ? usage.decisions.map((d: any) => <Chip key={d.id} item={{ kind: 'decision', id: d.id, name: d.name, href: d.href }} />) : <span className="text-[#6f6f6f]">none yet</span>}</div>
        </div>}
      </div>}
    </Modal>
  );
}
