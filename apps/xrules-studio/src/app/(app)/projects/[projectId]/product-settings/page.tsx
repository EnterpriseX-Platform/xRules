'use client';
// Product settings: rows are settings (max DSR (bureau hit), min RI, min credit line), columns are products.
// Edited like a sheet; paste a block from Excel, drop an .xlsx or .csv, or export. A line reads "<setting> of this product".
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Btn, DropZone } from '@/components/pipeline/ui';
import { usePerms } from '@/lib/perms';
import { readTable } from '@/lib/termImport';
import { useListRemove, RemovedCell } from '@/lib/listRemove';

type Row = { id?: string; key: string; name: string; values: Record<string, any>; _removed?: boolean };
const nk = () => `n${Math.random().toString(36).slice(2, 9)}`;

export default function ProductSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const perms = usePerms(); const qc = useQueryClient();
  const qk = ['product-settings', projectId];
  const { data } = useQuery({ queryKey: qk, queryFn: () => api.get<any>(`/platform/settings-table?project_id=${projectId}`) });
  const rk = ['product-settings-rows', projectId];
  const { data: saved = [] } = useQuery({ queryKey: rk, queryFn: async () => ((await api.get<any>(`/platform/settings-table?project_id=${projectId}`)).rows || []) as any[] });
  const [draft, setDraft] = useState<Record<string, Row>>({}); const [added, setAdded] = useState<Row[]>([]); const [extraCols, setExtraCols] = useState<string[]>([]);
  const [newCol, setNewCol] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const del = useListRemove<any>({ queryKey: rk, also: [qk], noun: 'setting', name: r => `"${r.name}"`, remove: r => api.post('/platform/settings-table/remove', { ids: [r.id] }), restore: r => api.post('/platform/settings-table/restore', { ids: [r.id] }) });
  if (!data) return null;
  const products: string[] = Array.from(new Set([...(data.products || []), ...extraCols]));
  const rows: Row[] = [...(saved as any[]).map(r => draft[r.id] || { id: r.id, key: r.id, name: r.name, values: r.values || {}, _removed: r._removed }), ...added];
  const dirty = Object.keys(draft).length > 0 || added.length > 0;
  const edit = (r: Row, next: Row) => { if (r.id) setDraft(d => ({ ...d, [r.id!]: next })); else setAdded(a => a.map(x => (x.key === r.key ? next : x))); };
  const cell = (r: Row, ci: number) => (ci === 0 ? r.name : String(r.values[products[ci - 1]] ?? ''));
  const withCell = (r: Row, ci: number, v: string): Row => (ci === 0 ? { ...r, name: v } : { ...r, values: { ...r.values, [products[ci - 1]]: v } });

  /** Rows from a table whose first row names the products (first column = setting). */
  const takeTable = (t: any[][]) => {
    const head = (t[0] || []).map(h => String(h ?? '').trim()); const cols = head.slice(1).filter(Boolean);
    setExtraCols(c => Array.from(new Set([...c, ...cols])));
    const byName = new Map(rows.map(r => [r.name.trim().toLowerCase(), r]));
    const fresh: Row[] = [];
    for (const line of t.slice(1)) {
      const name = String(line[0] ?? '').trim(); if (!name) continue;
      const values: Record<string, any> = {}; head.slice(1).forEach((h, i) => { if (h && line[i + 1] !== undefined && line[i + 1] !== null && String(line[i + 1]).trim() !== '') values[h] = line[i + 1]; });
      const hit = byName.get(name.toLowerCase());
      if (hit) edit(hit, { ...hit, values: { ...hit.values, ...values } }); else fresh.push({ key: nk(), name, values });
    }
    if (fresh.length) setAdded(a => [...a, ...fresh]);
  };
  function onPaste(e: React.ClipboardEvent, ri: number, ci: number) {
    const t = e.clipboardData.getData('text/plain'); if (!/[\t\n]/.test(t.replace(/\r?\n$/, ''))) return;
    e.preventDefault();
    const block = t.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(l => l.split('\t'));
    // a pasted block with a header row naming the products is a whole table
    if (ri === 0 && ci === 0 && block[0].length > 1 && block[0].slice(1).every(h => products.includes(h.trim()) || isNaN(Number(h)))) { takeTable(block); return; }
    const all = [...rows]; const fresh: Row[] = [];
    block.forEach((line, dr) => { let r = all[ri + dr]; const isNew = !r; if (!r) r = { key: nk(), name: '', values: {} };
      line.forEach((v, dc) => { if (ci + dc <= products.length) r = withCell(r, ci + dc, v.trim()); });
      if (isNew) fresh.push(r); else edit(all[ri + dr], r); });
    if (fresh.length) setAdded(a => [...a, ...fresh]);
  }
  async function save() {
    setBusy(true); setErr(null);
    try {
      await api.post('/platform/settings-table', { projectId, rows: rows.filter(r => !r._removed && (r.name.trim() || Object.values(r.values).some(v => String(v ?? '').trim()))).map(r => ({ id: r.id, name: r.name, values: r.values })) });
      setDraft({}); setAdded([]); await qc.invalidateQueries({ queryKey: rk }); await qc.invalidateQueries({ queryKey: qk });
    } catch (e: any) { setErr(e?.message || "Couldn't save"); } finally { setBusy(false); }
  }
  async function exportXlsx() {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Product settings');
    ws.addRow(['Setting', ...products]);
    rows.filter(r => !r._removed).forEach(r => ws.addRow([r.name, ...products.map(p => { const v = r.values[p]; return v !== '' && v !== undefined && !isNaN(Number(v)) ? Number(v) : v ?? ''; })]));
    ws.getRow(1).font = { bold: true }; ws.getColumn(1).width = 32; products.forEach((_, i) => { ws.getColumn(i + 2).width = 18; });
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = 'product-settings.xlsx'; a.click(); URL.revokeObjectURL(a.href);
  }
  const box = 'w-full h-10 px-3 bg-transparent text-[14px] text-[#161616] outline-none focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2';
  const ro = !perms.write;

  return (
    <div className="px-8 py-6 max-w-[1300px]">
      <PageHead title="Product settings" actions={<div className="flex gap-2"><Btn kind="tertiary" onClick={exportXlsx}>Export</Btn>{!ro && <Btn disabled={!dirty || busy} onClick={save}>{busy ? 'Saving' : 'Save'}</Btn>}</div>} />
      {err && <div className="mb-3 text-[14px] text-[#da1e28]">{err}</div>}
      <div className="bg-white border border-[#e0e0e0] overflow-x-auto">
        <table className="w-full border-collapse text-[14px]">
          <thead><tr className="bg-[#f4f4f4] text-[12px] font-semibold text-[#525252] text-left">
            <th className="h-10 px-3 border-b border-r border-[#e0e0e0] min-w-[260px]">Setting</th>
            {products.map(p => <th key={p} className="h-10 px-3 border-b border-r border-[#e0e0e0] min-w-[140px]">{p}</th>)}
            {!ro && <th className="h-10 px-2 border-b border-[#e0e0e0] min-w-[200px]"><span className="flex items-center gap-2"><input aria-label="New product column" className="h-8 w-[140px] px-2 bg-white border-b border-[#8d8d8d] text-[13px] font-normal outline-none focus:border-[#0f62fe]" placeholder="Add product" value={newCol} onChange={e => setNewCol(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newCol.trim()) { e.preventDefault(); setExtraCols(c => [...c, newCol.trim()]); setNewCol(''); } }} />
              <button type="button" className="h-8 px-2 text-[#0f62fe] font-normal hover:bg-[#e8e8e8] disabled:text-[#8d8d8d]" disabled={!newCol.trim()} onClick={() => { setExtraCols(c => [...c, newCol.trim()]); setNewCol(''); }}>Add</button></span></th>}
          </tr></thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={r.key} className={r._removed ? 'text-[#8d8d8d]' : ''}>
                {[0, ...products.map((_, i) => i + 1)].map(ci => (
                  <td key={ci} className={`border-b border-r border-[#e0e0e0] p-0 ${ci > 0 ? 'tabular-nums' : ''}`}>
                    {ro || r._removed ? <span className="block px-3 h-10 leading-10">{cell(r, ci)}</span>
                      : <input aria-label={ci === 0 ? 'Setting name' : `${products[ci - 1]} value`} className={box} value={cell(r, ci)} onChange={e => edit(r, withCell(r, ci, e.target.value))} onPaste={e => onPaste(e, ri, ci)} />}
                  </td>))}
                {!ro && <td className="border-b border-[#e0e0e0] px-2 whitespace-nowrap">
                  {r._removed ? <RemovedCell onUndo={() => del.undo(r as any)} /> : r.id ? <button type="button" disabled={del.isBusy(r as any)} className="h-8 px-3 text-[14px] text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={() => del.request(r as any)}>Remove</button>
                    : <button type="button" className="h-8 px-3 text-[14px] text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={() => setAdded(a => a.filter(x => x.key !== r.key))}>Remove</button>}
                </td>}
              </tr>))}
            {!rows.length && <tr><td colSpan={products.length + 2} className="px-5 py-6 text-[14px] text-[#525252]">No settings yet</td></tr>}
          </tbody>
        </table>
        {!ro && <div className="px-3 py-2 border-t border-[#e0e0e0]"><button type="button" className="h-8 px-2 text-[14px] text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={() => setAdded(a => [...a, { key: nk(), name: '', values: {} }])}>+ Setting</button></div>}
      </div>
      {!ro && <div className="mt-4"><DropZone accept=".xlsx,.csv" label="Drop an .xlsx or .csv file here or click to choose" onFile={async f => { setErr(null); try { takeTable(await readTable(f)); } catch (e: any) { setErr(e?.message || "Couldn't read the file"); } }} /></div>}
      {del.confirm}
    </div>
  );
}
