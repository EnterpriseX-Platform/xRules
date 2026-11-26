'use client';
// Test cases of one rule or flow as a spreadsheet: one row per case, input columns then expected-result columns.
// Paste a block straight from Excel, or import / export an .xlsx file.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Play, Download, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal, DropZone } from '@/components/pipeline/ui';
import { toText, fromText, type Field } from './FieldsEditor';
import { useTerms } from '@/lib/terms';
import { FmtInput } from '@/components/ui/FmtInput';

type Row = { key: string; id?: string; name: string; input: Record<string, any>; expect: Record<string, string>; other: any[]; status?: string; checks?: any[]; output?: any };
const read = (o: any, path: string) => path.split('.').filter(Boolean).reduce((a, k) => a?.[k], o);
let seq = 0; const nk = () => `n${++seq}`;

function fromCase(c: any): Row {
  const exps: any[] = Array.isArray(c.expectations) ? c.expectations : [];
  const expect: Record<string, string> = {}; const other: any[] = [];
  for (const e of exps) {
    if (e?.kind === 'equals' && e.path && e.path !== '$') expect[String(e.path).replace(/^\$\.?/, '')] = toText(e.value);
    else other.push(e);
  }
  return { key: c.id, id: c.id, name: c.name, input: c.input || {}, expect, other, status: c.lastStatus, checks: c.lastResult?.checks, output: c.lastResult?.output };
}

export function TestSheet({ targetType, targetId, inputs, outputs, projectId }: { targetType: 'rule' | 'decision_flow'; targetId: string; inputs: Field[]; outputs: string[]; projectId?: string }) {
  const { label } = useTerms(projectId);
  const qc = useQueryClient();
  const qk = ['test-sheet', targetType, targetId];
  const { data: cases, isFetched } = useQuery({ queryKey: qk, queryFn: () => api.get<any[]>(`/platform/tests/target/${targetType}/${targetId}`), enabled: !!targetId });
  const [rows, setRows] = useState<Row[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'' | 'save' | 'run'>('');
  const [err, setErr] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);

  useEffect(() => { if (cases && !dirty) { setRows(cases.map(fromCase)); setRemoved([]); } }, [cases]); // eslint-disable-line react-hooks/exhaustive-deps

  // columns: declared fields first, then anything already used in saved cases
  const inCols = useMemo(() => {
    const names = inputs.map(f => f.name);
    rows.forEach(r => Object.keys(r.input || {}).forEach(k => { if (!names.includes(k)) names.push(k); }));
    return names.map(n => ({ name: n, type: inputs.find(f => f.name === n)?.type }));
  }, [inputs, rows]);
  const outCols = useMemo(() => {
    const names = [...outputs];
    rows.forEach(r => Object.keys(r.expect || {}).forEach(k => { if (!names.includes(k)) names.push(k); }));
    return names;
  }, [outputs, rows]);
  const cols = [{ kind: 'name' as const, name: 'Case' }, ...inCols.map(c => ({ kind: 'in' as const, ...c })), ...outCols.map(n => ({ kind: 'out' as const, name: n }))];

  const touch = (next: Row[]) => { setRows(next); setDirty(true); };
  const blankRow = (): Row => ({ key: nk(), name: '', input: {}, expect: {}, other: [] });
  const getCell = (r: Row, ci: number) => { const c = cols[ci]; return c.kind === 'name' ? r.name : c.kind === 'in' ? toText(r.input[c.name]) : (r.expect[c.name] ?? ''); };
  const withCell = (r: Row, ci: number, text: string): Row => {
    const c = cols[ci];
    if (c.kind === 'name') return { ...r, name: text };
    if (c.kind === 'in') { const input = { ...r.input }; if (text === '') delete input[c.name]; else input[c.name] = fromText(text, (c as any).type); return { ...r, input }; }
    const expect = { ...r.expect }; if (text === '') delete expect[c.name]; else expect[c.name] = text; return { ...r, expect };
  };
  const setCell = (ri: number, ci: number, text: string) => touch(rows.map((r, i) => (i === ri ? withCell(r, ci, text) : r)));

  // paste a block from Excel (tab / newline separated) starting at the focused cell
  function onPaste(e: React.ClipboardEvent, ri: number, ci: number) {
    const t = e.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(t.replace(/\r?\n$/, ''))) return;
    e.preventDefault();
    const block = t.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(l => l.split('\t'));
    const next = [...rows];
    block.forEach((line, dr) => {
      const at = ri + dr;
      if (!next[at]) next[at] = blankRow();
      line.forEach((v, dc) => { if (ci + dc < cols.length) next[at] = withCell(next[at], ci + dc, v.trim()); });
    });
    touch(next);
  }
  function move(e: React.KeyboardEvent, ri: number, ci: number) {
    let r = ri, c = ci;
    if (e.key === 'Enter' || (e.key === 'ArrowDown' && !e.shiftKey)) r++;
    else if (e.key === 'ArrowUp') r--;
    else return;
    e.preventDefault();
    if (r >= rows.length && e.key === 'Enter') { touch([...rows, blankRow()]); }
    setTimeout(() => (tableRef.current?.querySelector(`[data-cell="${Math.max(0, r)}-${c}"]`) as HTMLInputElement | null)?.focus(), 0);
  }

  const payload = () => ({
    targetType, targetId, removed,
    rows: rows.map(r => ({
      id: r.id, name: r.name, input: r.input,
      expectations: [...Object.entries(r.expect).map(([path, v]) => ({ kind: 'equals', path, value: fromText(v) })), ...r.other],
    })),
  });
  async function save() {
    const unnamed = rows.findIndex(r => !r.name.trim() && (Object.keys(r.input).length || Object.keys(r.expect).length));
    if (unnamed >= 0) { setErr(`Row ${unnamed + 1} needs a case name`); return false; }
    setBusy('save'); setErr(null);
    try { await api.post('/platform/tests/sheet', payload()); setDirty(false); await qc.invalidateQueries({ queryKey: qk }); return true; }
    catch (e: any) { setErr(e?.message || 'Save failed'); return false; }
    finally { setBusy(''); }
  }
  async function runAll() {
    if (dirty && !(await save())) return;
    setBusy('run'); setErr(null);
    try { await api.post(`/platform/tests/target/${targetType}/${targetId}/run`, {}); setDirty(false); await qc.invalidateQueries({ queryKey: qk }); qc.invalidateQueries({ queryKey: ['test-count', targetType, targetId] }); }
    catch (e: any) { setErr(e?.message || 'Run failed'); }
    finally { setBusy(''); }
  }

  async function exportXlsx() {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Test cases');
    ws.addRow(cols.map(c => (c.kind === 'out' ? `expected: ${c.name}` : c.name)));
    rows.forEach(r => ws.addRow(cols.map((_, ci) => { const v = getCell(r, ci); return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v; })));
    ws.getRow(1).font = { bold: true };
    cols.forEach((c, i) => { ws.getColumn(i + 1).width = Math.max(14, c.name.length + 4); if (c.kind === 'out') ws.getCell(1, i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDEFBE6' } }; });
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = 'test-cases.xlsx'; a.click(); URL.revokeObjectURL(a.href);
  }
  async function importXlsx(file: File) {
    setErr(null);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0]; if (!ws) throw new Error('The file has no sheet');
      const head: string[] = []; ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { head[i - 1] = String(c.text || '').trim(); });
      const map = head.map(h => {
        if (!h) return null;
        if (/^(case|name|ชื่อ)/i.test(h)) return { kind: 'name' as const, name: 'Case' };
        const m = h.match(/^(expected|คาดหวัง)\s*:\s*(.+)$/i);
        return m ? { kind: 'out' as const, name: m[2].trim() } : { kind: 'in' as const, name: h };
      });
      const got: Row[] = [];
      ws.eachRow((row, n) => {
        if (n === 1) return;
        let r = blankRow(); let any = false;
        map.forEach((m, i) => {
          if (!m) return; const t = String(row.getCell(i + 1).text ?? '').trim(); if (t === '') return; any = true;
          if (m.kind === 'name') r.name = t;
          else if (m.kind === 'in') r.input = { ...r.input, [m.name]: fromText(t, inputs.find(f => f.name === m.name)?.type) };
          else r.expect = { ...r.expect, [m.name]: t };
        });
        if (any) { if (!r.name) r.name = `Case ${rows.length + got.length + 1}`; got.push(r); }
      });
      touch([...rows.filter(r => r.name || Object.keys(r.input).length), ...got]);
      setImporting(false);
    } catch (e: any) { setErr(`Could not read the file: ${e?.message || e}`); }
  }

  const passed = rows.filter(r => !dirty && r.status === 'PASS').length;
  const ran = rows.some(r => r.status && r.status !== 'PENDING');
  const th = 'h-9 px-2 text-left text-[12px] font-semibold border-b border-r border-[#e0e0e0] whitespace-nowrap';
  const td = 'p-0 border-b border-r border-[#e0e0e0]';
  const inp = 'h-9 w-full min-w-[120px] px-2 bg-transparent text-[14px] outline-none focus:bg-white focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-[14px] text-[#161616] tabular-nums mr-2">{rows.length} cases{ran && !dirty ? ` · ${passed} passed` : ''}{dirty ? ' · not saved' : ''}</span>
        <div className="flex-1" />
        <button type="button" onClick={() => setImporting(true)} className="h-9 px-3 text-[14px] text-[#0f62fe] hover:bg-[#e8e8e8] flex items-center gap-1.5"><Upload className="h-4 w-4" />Import .xlsx</button>
        <button type="button" onClick={exportXlsx} className="h-9 px-3 text-[14px] text-[#0f62fe] hover:bg-[#e8e8e8] flex items-center gap-1.5"><Download className="h-4 w-4" />Download .xlsx</button>
        <button type="button" onClick={save} disabled={!dirty || !!busy} className="h-9 px-4 text-[14px] border border-[#0f62fe] text-[#0f62fe] hover:bg-[#edf5ff] disabled:border-[#c6c6c6] disabled:text-[#a8a8a8] disabled:hover:bg-transparent">Save</button>
        <button type="button" onClick={runAll} disabled={!!busy || !rows.length} className="h-9 px-4 text-[14px] bg-[#0f62fe] text-white hover:bg-[#0353e9] disabled:bg-[#c6c6c6] flex items-center gap-1.5"><Play className="h-4 w-4" />{busy === 'run' ? 'Running' : 'Run all'}</button>
      </div>
      {err && <div className="mb-3 border-l-4 border-[#da1e28] bg-[#fff1f1] px-4 py-2.5 text-[14px]">{err}</div>}
      <div className="overflow-auto border-l border-t border-[#e0e0e0] bg-white max-h-[60vh]">
        <table ref={tableRef} className="border-collapse text-[14px] min-w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={`${th} w-10 bg-[#f4f4f4] text-[#6f6f6f]`}>#</th>
              {cols.map(c => (
                <th key={`${c.kind}-${c.name}`} className={`${th} ${c.kind === 'out' ? 'bg-[#defbe6] text-[#044317]' : c.kind === 'in' ? 'bg-[#edf5ff] text-[#002d9c]' : 'bg-[#f4f4f4] text-[#161616]'}`}>
                  <span title={c.name}>{c.kind === 'out' ? <>Expected · {label(c.name)}</> : c.kind === 'in' ? label(c.name) : 'Case'}</span>
                </th>
              ))}
              <th className={`${th} bg-[#f4f4f4] text-[#161616]`}>Result</th>
              <th className={`${th} w-9 bg-[#f4f4f4]`} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => {
              const st = dirty ? undefined : r.status;
              return (
                <tr key={r.key} className="hover:bg-[#f9f9f9]">
                  <td className={`${td} text-center text-[12px] text-[#6f6f6f] tabular-nums bg-[#f4f4f4]`}>{ri + 1}</td>
                  {cols.map((c, ci) => (
                    <td key={ci} className={td}>
                      {c.kind === 'name'
                        ? <input data-cell={`${ri}-${ci}`} className={inp} value={getCell(r, ci)} aria-label={`Case name row ${ri + 1}`}
                            onChange={e => setCell(ri, ci, e.target.value)} onPaste={e => onPaste(e, ri, ci)} onKeyDown={e => move(e, ri, ci)} />
                        : <FmtInput data-cell={`${ri}-${ci}`} className={`${inp} text-right tabular-nums`} size={1} value={getCell(r, ci)} aria-label={`${c.kind === 'out' ? 'Expected ' : ''}${c.name} row ${ri + 1}`}
                            onChange={v => setCell(ri, ci, v)} onPaste={e => onPaste(e, ri, ci)} onKeyDown={e => move(e, ri, ci)} />}
                    </td>
                  ))}
                  <td className={`${td} px-2 whitespace-nowrap`}>
                    {st === 'PASS' && <span className="text-[#198038]">✓ Passed</span>}
                    {(st === 'FAIL' || st === 'ERROR') && (
                      <span className="text-[#da1e28]" title={(r.checks || []).filter((x: any) => !x.ok).map((x: any) => x.message).join('\n')}>
                        ✗ Got {outCols.map(o => r.expect[o] !== undefined ? `${label(o)} = ${toText(read(r.output, o))}` : null).filter(Boolean).join(' · ') || (r.checks || []).find((x: any) => !x.ok)?.message || 'Failed'}
                      </span>
                    )}
                  </td>
                  <td className={td}>
                    <button type="button" aria-label={`Remove row ${ri + 1}`} className="h-9 w-9 flex items-center justify-center text-[#525252] hover:bg-[#e8e8e8]"
                      onClick={() => { if (r.id) setRemoved(x => [...x, r.id!]); touch(rows.filter((_, i) => i !== ri)); }}><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" className="mt-1 h-9 px-2 text-[14px] text-[#0f62fe] hover:bg-[#e8e8e8] flex items-center gap-1" onClick={() => touch([...rows, blankRow()])}>
        <Plus className="h-4 w-4" /> Add row
      </button>
      {isFetched && !rows.length && <div className="hidden" />}
      {importing && (
        <Modal title="Import .xlsx" onClose={() => setImporting(false)} error={err}>
          <DropZone accept=".xlsx" label="Drop an .xlsx file here or click to choose" onFile={importXlsx} />
        </Modal>
      )}
    </div>
  );
}
