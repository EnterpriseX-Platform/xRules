'use client';
// Lookup Table designer — primary key column locked to the left + arbitrary value columns.
// Definition shape: { primaryKey: 'colName', columns: [{name,type}], rows: [{col1,col2,...}] }
import { useMemo, useState } from 'react';
import { Plus, Trash2, Upload, Search } from 'lucide-react';

interface Col { name: string; type: 'string' | 'number' | 'boolean' }

export function LookupDesigner({ definition, onChange }: { definition: any; onChange: (next: any) => void }) {
  const [primaryKey, setPrimaryKey] = useState<string>(definition?.primaryKey || 'id');
  const [columns, setColumns] = useState<Col[]>(definition?.columns || [{ name: 'id', type: 'string' }, { name: 'value', type: 'string' }]);
  const [rows, setRows] = useState<Record<string, any>[]>(definition?.rows || []);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  function emit(p: { primaryKey?: string; columns?: Col[]; rows?: Record<string, any>[] }) {
    onChange({
      primaryKey: p.primaryKey ?? primaryKey,
      columns:    p.columns    ?? columns,
      rows:       p.rows       ?? rows,
    });
  }

  function addRow() {
    const r: Record<string, any> = {};
    columns.forEach(c => r[c.name] = '');
    const next = [...rows, r];
    setRows(next); emit({ rows: next });
  }
  function removeRow(idx: number) {
    const next = rows.filter((_, i) => i !== idx);
    setRows(next); emit({ rows: next });
  }
  function setCell(idx: number, col: string, value: any) {
    const next = rows.map((r, i) => i === idx ? { ...r, [col]: value } : r);
    setRows(next); emit({ rows: next });
  }
  function addColumn() {
    const next: Col[] = [...columns, { name: `col${columns.length + 1}`, type: 'string' }];
    setColumns(next); emit({ columns: next });
  }
  function removeColumn(name: string) {
    if (name === primaryKey) { alert('Cannot remove primary key column'); return; }
    const next = columns.filter(c => c.name !== name);
    const nextRows = rows.map(r => { const x = { ...r }; delete x[name]; return x; });
    setColumns(next); setRows(nextRows); emit({ columns: next, rows: nextRows });
  }

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)));
  }, [rows, search]);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  async function importFile(file: File) {
    const text = await file.text();
    let parsed: Record<string, any>[] = [];
    if (file.name.endsWith('.json')) {
      const j = JSON.parse(text);
      parsed = Array.isArray(j) ? j : (j.rows || []);
    } else {
      // CSV
      const lines = text.split(/\r?\n/).filter(Boolean);
      const header = lines[0].split(',').map(s => s.trim());
      parsed = lines.slice(1).map(line => {
        const cells = line.split(',');
        const r: Record<string, any> = {};
        header.forEach((h, i) => {
          const v = (cells[i] || '').trim();
          r[h] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
        });
        return r;
      });
      // sync columns from header
      const cols: Col[] = header.map(h => ({ name: h, type: 'string' }));
      setColumns(cols);
      setPrimaryKey(header[0] || primaryKey);
      emit({ columns: cols, primaryKey: header[0] || primaryKey, rows: parsed });
      setRows(parsed);
      return;
    }
    // For JSON imports, derive columns from first row keys
    if (parsed[0]) {
      const cols: Col[] = Object.keys(parsed[0]).map(name => ({ name, type: 'string' }));
      setColumns(cols);
      emit({ columns: cols, rows: parsed });
    }
    setRows(parsed);
    emit({ rows: parsed });
  }

  return (
    <div className="space-y-3">
      <div className="card p-3 flex items-center gap-3 flex-wrap">
        <span className="label-section">Primary Key</span>
        <select className="input h-8 text-xs" value={primaryKey} onChange={(e) => { setPrimaryKey(e.target.value); emit({ primaryKey: e.target.value }); }}>
          {columns.map(c => <option key={c.name}>{c.name}</option>)}
        </select>

        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-subtle" />
          <input className="input w-full pl-9 h-8 text-xs" placeholder="search rows…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </div>

        <span className="font-mono text-[11px] text-subtle">{filtered.length} rows</span>

        <label className="btn-outline text-xs cursor-pointer">
          <Upload className="h-3 w-3" />
          Import CSV/JSON
          <input type="file" accept=".csv,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        </label>
        <button className="btn-ghost text-xs" onClick={addColumn}><Plus className="h-3 w-3" /> Column</button>
        <button className="btn-primary text-xs" onClick={addRow}><Plus className="h-3 w-3" /> Row</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <thead className="bg-muted/30">
            <tr className="border-b border-border">
              <th className="px-2 py-2 w-10 text-subtle">#</th>
              {columns.map(c => (
                <th key={c.name} className={`px-2 py-2 text-left min-w-[120px] ${c.name === primaryKey ? 'sticky left-10 bg-mint/10' : ''}`}>
                  <div className="flex items-center gap-1">
                    <input
                      className="bg-transparent border-0 outline-none flex-1 font-mono text-xs"
                      value={c.name}
                      onChange={(e) => {
                        const next = columns.map(x => x.name === c.name ? { ...x, name: e.target.value } : x);
                        // Rename rows keys
                        const nextRows = rows.map(r => {
                          const { [c.name]: v, ...rest } = r;
                          return { ...rest, [e.target.value]: v };
                        });
                        setColumns(next); setRows(nextRows);
                        if (primaryKey === c.name) setPrimaryKey(e.target.value);
                        emit({ columns: next, rows: nextRows, primaryKey: primaryKey === c.name ? e.target.value : primaryKey });
                      }}
                    />
                    {c.name === primaryKey && <span className="font-mono text-[8px] text-mint uppercase">PK</span>}
                    {c.name !== primaryKey && (
                      <button className="btn-ghost p-0 opacity-50 hover:opacity-100" onClick={() => removeColumn(c.name)}>
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && <tr><td colSpan={columns.length + 2} className="py-12 text-center text-subtle">No rows</td></tr>}
            {paged.map((r, idx) => {
              const realIdx = page * PAGE_SIZE + idx;
              return (
                <tr key={realIdx} className="border-b border-border/50">
                  <td className="px-2 py-1.5 text-subtle tabular-nums">{String(realIdx + 1).padStart(3, '0')}</td>
                  {columns.map(c => (
                    <td key={c.name} className={`px-2 py-1 ${c.name === primaryKey ? 'sticky left-10 bg-mint/5 font-medium' : ''}`}>
                      <input
                        className="bg-transparent border-0 outline-none w-full font-mono text-[11px]"
                        value={r[c.name] === undefined || r[c.name] === null ? '' : String(r[c.name])}
                        onChange={(e) => setCell(realIdx, c.name, e.target.value)}
                      />
                    </td>
                  ))}
                  <td>
                    <button className="btn-ghost p-1 text-danger" onClick={() => removeRow(realIdx)}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs font-mono text-subtle">
          <button className="btn-ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span>Page {page + 1} of {Math.ceil(filtered.length / PAGE_SIZE)}</span>
          <button className="btn-ghost" disabled={(page + 1) * PAGE_SIZE >= filtered.length} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
