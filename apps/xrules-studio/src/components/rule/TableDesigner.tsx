'use client';

// DR-style Decision Table designer.
// Layout: hit policy + columns + rows + Else row + bulk row ops + duplicate-detect badge.
// Colors: condition cells (LHS) tinted yellow; result cells (RHS) tinted green.
// Rule definition shape kept compatible:
//   { hitPolicy: 'FIRST'|'ARRAY'|..., inputs:[{name,type,label}], outputs:[...], rules:[{id,inputs:[...],outputs:[...]}] }
import { useMemo, useState } from 'react';
import { Plus, Trash2, Copy, Check, AlertTriangle, Search, ArrowDown } from 'lucide-react';
import { OPERATORS, HIT_POLICIES, formatCellExpression, parseCellExpression } from './operators';
import { cn } from '@/lib/cn';

type ColumnSide = 'condition' | 'result';
interface Column { name: string; type: string; label?: string; side: ColumnSide }
interface Row { id: string; inputs: any[]; outputs: any[]; annotation?: string }

interface DefShape {
  hitPolicy?: string;
  inputs?: any[];
  outputs?: any[];
  rules?: any[];
}

export function TableDesigner({
  definition, inputSchema, outputSchema, onChange,
}: {
  definition: any;
  inputSchema?: any;
  outputSchema?: any;
  onChange: (next: DefShape) => void;
}) {
  // Normalize incoming definition into local working state
  const [hitPolicy, setHitPolicy] = useState<string>(definition?.hitPolicy || 'STANDARD');
  const [inputs, setInputs] = useState<Column[]>(() => normalizeColumns(definition?.inputs, inputSchema, 'condition'));
  const [outputs, setOutputs] = useState<Column[]>(() => normalizeColumns(definition?.outputs, outputSchema, 'result'));
  const [rows, setRows] = useState<Row[]>(() => (definition?.rules || []).map((r: any, i: number) => ({
    id: r.id || `r${i}`, inputs: r.inputs || [], outputs: r.outputs || [], annotation: r.annotation,
  })));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  // Push a snapshot up to parent whenever we mutate
  function emit(next: Partial<{ hitPolicy: string; inputs: Column[]; outputs: Column[]; rows: Row[] }>) {
    const merged = {
      hitPolicy: next.hitPolicy ?? hitPolicy,
      inputs: (next.inputs ?? inputs).map(({ side, ...c }) => c),
      outputs: (next.outputs ?? outputs).map(({ side, ...c }) => c),
      rules: (next.rows ?? rows).map(r => ({ id: r.id, inputs: r.inputs, outputs: r.outputs, annotation: r.annotation })),
    };
    onChange(merged);
  }

  // Detect duplicate rows by signature of all input cells
  const duplicates = useMemo(() => {
    const groups = new Map<string, string[]>();
    rows.forEach(r => {
      const key = JSON.stringify(r.inputs);
      const list = groups.get(key) || [];
      list.push(r.id);
      groups.set(key, list);
    });
    const dup = new Set<string>();
    groups.forEach((ids) => { if (ids.length > 1) ids.forEach((i: string) => dup.add(i)); });
    return dup;
  }, [rows]);

  const filteredRowIds = useMemo(() => {
    if (!search) return new Set(rows.map(r => r.id));
    const q = search.toLowerCase();
    return new Set(rows.filter(r =>
      r.id.toLowerCase().includes(q) ||
      (r.annotation || '').toLowerCase().includes(q) ||
      JSON.stringify(r.inputs).toLowerCase().includes(q) ||
      JSON.stringify(r.outputs).toLowerCase().includes(q)
    ).map(r => r.id));
  }, [rows, search]);

  function addRow(asElse = false) {
    const id = 'r' + Date.now().toString(36);
    const ins = inputs.map(() => asElse ? '_else_' : '-');
    const outs = outputs.map(() => null);
    const next = [...rows, { id, inputs: ins, outputs: outs }];
    setRows(next); emit({ rows: next });
  }
  function removeSelected() {
    const next = rows.filter(r => !selected.has(r.id));
    setRows(next); setSelected(new Set()); emit({ rows: next });
  }
  function duplicateRow(id: string) {
    const r = rows.find(x => x.id === id);
    if (!r) return;
    const clone = { ...r, id: 'r' + Date.now().toString(36), inputs: [...r.inputs], outputs: [...r.outputs] };
    const idx = rows.findIndex(x => x.id === id);
    const next = [...rows.slice(0, idx + 1), clone, ...rows.slice(idx + 1)];
    setRows(next); emit({ rows: next });
  }
  function setCell(rowId: string, side: 'inputs' | 'outputs', colIdx: number, value: any) {
    const next = rows.map(r => r.id !== rowId ? r : { ...r, [side]: r[side].map((v: any, i: number) => i === colIdx ? value : v) });
    setRows(next); emit({ rows: next });
  }
  function addColumn(side: ColumnSide) {
    const list = side === 'condition' ? inputs : outputs;
    const setList = side === 'condition' ? setInputs : setOutputs;
    const next = [...list, { name: side === 'condition' ? `input${list.length + 1}` : `output${list.length + 1}`, type: 'string', side }];
    setList(next);
    // Pad existing rows
    const padded = rows.map(r => ({
      ...r,
      [side === 'condition' ? 'inputs' : 'outputs']: [...r[side === 'condition' ? 'inputs' : 'outputs'], side === 'condition' ? '-' : null],
    }));
    setRows(padded);
    emit({
      [side === 'condition' ? 'inputs' : 'outputs']: next,
      rows: padded,
    } as any);
  }
  function removeColumn(side: ColumnSide, colIdx: number) {
    const list = side === 'condition' ? inputs : outputs;
    const setList = side === 'condition' ? setInputs : setOutputs;
    const nextCols = list.filter((_, i) => i !== colIdx);
    setList(nextCols);
    const nextRows = rows.map(r => ({
      ...r,
      [side === 'condition' ? 'inputs' : 'outputs']: r[side === 'condition' ? 'inputs' : 'outputs'].filter((_: any, i: number) => i !== colIdx),
    }));
    setRows(nextRows);
    emit({
      [side === 'condition' ? 'inputs' : 'outputs']: nextCols,
      rows: nextRows,
    } as any);
  }

  return (
    <div className="space-y-3">
      {/* Toolbar — hit policy + search + duplicate badge */}
      <div className="card p-3 flex items-center gap-3 flex-wrap">
        <span className="label-section">Hit Policy</span>
        <select
          className="input h-8 text-xs"
          value={hitPolicy}
          onChange={(e) => { setHitPolicy(e.target.value); emit({ hitPolicy: e.target.value }); }}
        >
          {HIT_POLICIES.map(p => <option key={p.code} value={p.code}>{p.label} — {p.description}</option>)}
        </select>

        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-subtle" />
          <input
            className="input w-full pl-9 h-8 text-xs"
            placeholder="search rows…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {duplicates.size > 0 && (
          <span className="pill pill-warn">
            <AlertTriangle className="h-3 w-3" />
            {duplicates.size} duplicate row{duplicates.size > 1 ? 's' : ''}
          </span>
        )}

        {selected.size > 0 && (
          <button className="btn-outline text-danger text-xs" onClick={removeSelected}>
            <Trash2 className="h-3 w-3" />
            Delete {selected.size}
          </button>
        )}

        <button className="btn-ghost text-xs ml-auto" onClick={() => addColumn('condition')}>
          <Plus className="h-3 w-3" /> Condition col
        </button>
        <button className="btn-ghost text-xs" onClick={() => addColumn('result')}>
          <Plus className="h-3 w-3" /> Result col
        </button>
        <button className="btn-primary text-xs" onClick={() => addRow(false)}>
          <Plus className="h-3 w-3" /> Row
        </button>
        <button className="btn-outline text-xs" onClick={() => addRow(true)}>
          <ArrowDown className="h-3 w-3" /> Else row
        </button>
      </div>

      {/* Grid */}
      <div className="card overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="px-2 py-2 w-10">
                <input
                  type="checkbox"
                  checked={selected.size === rows.length && rows.length > 0}
                  onChange={(e) => setSelected(e.target.checked ? new Set(rows.map(r => r.id)) : new Set())}
                />
              </th>
              <th className="px-2 py-2 w-10 text-subtle">#</th>
              {inputs.map((c, i) => (
                <ColumnHeader key={'i' + i} col={c} side="condition" inputSchema={inputSchema}
                  onUpdate={(next) => { const nx = inputs.map((x, idx) => idx === i ? { ...next, side: 'condition' as const } : x); setInputs(nx); emit({ inputs: nx }); }}
                  onRemove={() => removeColumn('condition', i)} />
              ))}
              <th className="px-1 py-2 border-l border-border" />
              {outputs.map((c, i) => (
                <ColumnHeader key={'o' + i} col={c} side="result" inputSchema={outputSchema}
                  onUpdate={(next) => { const nx = outputs.map((x, idx) => idx === i ? { ...next, side: 'result' as const } : x); setOutputs(nx); emit({ outputs: nx }); }}
                  onRemove={() => removeColumn('result', i)} />
              ))}
              <th className="px-2 py-2">Annotation</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={3 + inputs.length + outputs.length + 1} className="text-center py-12 text-subtle">No rows. Click "+ Row".</td></tr>
            )}
            {rows.map((r, ri) => {
              const isElse = r.inputs.every((v: any) => v === '_else_' || v === 'ELSE');
              const isDup = duplicates.has(r.id);
              const visible = filteredRowIds.has(r.id);
              if (!visible) return null;
              return (
                <tr key={r.id} className={cn(
                  'border-b border-border/50',
                  isDup && 'bg-warn/5',
                  isElse && 'bg-mint/5',
                  selected.has(r.id) && 'bg-accent/5',
                )}>
                  <td className="px-2 py-1.5 align-middle">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(r.id); else next.delete(r.id);
                        setSelected(next);
                      }}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-subtle tabular-nums">{String(ri + 1).padStart(2, '0')}</td>
                  {inputs.map((_, ci) => (
                    <td key={ci} className="border-r border-border/30 bg-warn/[0.04]">
                      <Cell side="condition" value={r.inputs[ci]} onChange={(v) => setCell(r.id, 'inputs', ci, v)} />
                    </td>
                  ))}
                  <td className="bg-border/30 w-px" />
                  {outputs.map((_, ci) => (
                    <td key={ci} className="border-r border-border/30 bg-ok/[0.04]">
                      <ResultCell value={r.outputs[ci]} onChange={(v) => setCell(r.id, 'outputs', ci, v)} />
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <input
                      className="bg-transparent w-full text-subtle text-[11px] outline-none"
                      placeholder="annotation…"
                      value={r.annotation || ''}
                      onChange={(e) => {
                        const next = rows.map(x => x.id === r.id ? { ...x, annotation: e.target.value } : x);
                        setRows(next); emit({ rows: next });
                      }}
                    />
                  </td>
                  <td>
                    <button className="btn-ghost p-1" title="Duplicate row" onClick={() => duplicateRow(r.id)}><Copy className="h-3 w-3" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-[11px] font-mono text-subtle px-1">
        💡 Yellow cells = conditions (LHS) · Green cells = results (RHS) · ELSE row stays at the bottom regardless of order
      </div>
    </div>
  );
}

function ColumnHeader({ col, side, inputSchema, onUpdate, onRemove }: {
  col: Column; side: ColumnSide; inputSchema?: any;
  onUpdate: (c: Column) => void; onRemove: () => void;
}) {
  const fields = inputSchema?.properties ? Object.keys(inputSchema.properties) : [];
  return (
    <th className="px-2 py-1.5 text-left align-top min-w-[120px] border-r border-border/30">
      <div className="flex items-start gap-1">
        <div className="flex-1 min-w-0">
          {fields.length > 0 ? (
            <select
              className="bg-transparent border-0 outline-none text-text font-mono text-xs w-full p-0 cursor-pointer"
              value={col.name}
              onChange={(e) => onUpdate({ ...col, name: e.target.value })}
            >
              {!fields.includes(col.name) && <option value={col.name}>{col.name} (custom)</option>}
              {fields.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          ) : (
            <input
              className="bg-transparent border-0 outline-none text-text font-mono text-xs w-full p-0"
              value={col.name}
              onChange={(e) => onUpdate({ ...col, name: e.target.value })}
            />
          )}
          <div className="text-[9px] uppercase tracking-label text-subtle mt-0.5">
            {side === 'condition' ? 'condition' : 'result'} · {col.type}
          </div>
        </div>
        <button className="btn-ghost p-0.5 opacity-50 hover:opacity-100" onClick={onRemove} title="Remove column">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </th>
  );
}

function Cell({ side, value, onChange }: { side: ColumnSide; value: any; onChange: (v: any) => void }) {
  // Decompose existing value into operator + args, render dropdown + 1 or 2 inputs.
  const parsed = parseCellExpression(value);
  const opSpec = OPERATORS.find(o => o.code === parsed.operator) || OPERATORS[0];

  function setOp(code: string) {
    const spec = OPERATORS.find(o => o.code === code)!;
    const args = parsed.args.slice(0, spec.argCount);
    while (args.length < spec.argCount) args.push('');
    onChange(formatCellExpression(spec.code, args));
  }
  function setArg(i: number, v: string) {
    const args = [...parsed.args];
    args[i] = v;
    onChange(formatCellExpression(parsed.operator, args));
  }

  return (
    <div className="flex items-center gap-1 px-1 py-1">
      <select
        className="bg-transparent border-0 outline-none text-[11px] font-mono text-text cursor-pointer"
        value={parsed.operator}
        onChange={(e) => setOp(e.target.value)}
      >
        {OPERATORS.map(op => <option key={op.code} value={op.code}>{op.code}</option>)}
      </select>
      {opSpec.argCount >= 1 && (
        <input
          className="bg-transparent border-0 outline-none text-[11px] font-mono text-text flex-1 min-w-0"
          placeholder="value"
          value={parsed.args[0] ?? ''}
          onChange={(e) => setArg(0, e.target.value)}
        />
      )}
      {opSpec.argCount === 2 && (
        <>
          <span className="text-[10px] text-subtle">AND</span>
          <input
            className="bg-transparent border-0 outline-none text-[11px] font-mono text-text flex-1 min-w-0"
            placeholder="value"
            value={parsed.args[1] ?? ''}
            onChange={(e) => setArg(1, e.target.value)}
          />
        </>
      )}
    </div>
  );
}

function ResultCell({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const stringValue = value === null || value === undefined ? '' : String(value);
  return (
    <input
      className="bg-transparent border-0 outline-none text-[11px] font-mono text-text w-full px-2 py-1.5"
      value={stringValue}
      onChange={(e) => {
        const v = e.target.value;
        if (v === 'true') onChange(true);
        else if (v === 'false') onChange(false);
        else if (v === '') onChange(null);
        else if (/^-?\d+(\.\d+)?$/.test(v)) onChange(Number(v));
        else onChange(v);
      }}
      placeholder="value"
    />
  );
}

function normalizeColumns(stored: any[] | undefined, schema: any, side: ColumnSide): Column[] {
  if (Array.isArray(stored) && stored.length) {
    return stored.map((c: any) => ({
      name: c.name || c.id || '',
      type: c.type || 'string',
      label: c.label,
      side,
    }));
  }
  if (schema?.properties) {
    return Object.entries(schema.properties).map(([name, spec]: [string, any]) => ({
      name, type: spec.type || 'string', side,
    }));
  }
  return [];
}
