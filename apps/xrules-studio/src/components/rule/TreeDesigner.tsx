'use client';
// Decision Tree designer — IF / OR-group / THEN / ELSE blocks with visual nesting.
// Definition shape:
// { root: TreeNode } where TreeNode = { type:'if', conditions:[{field,op,value,...}], orGroups:[[...]], then:{...}|null, else:{...}|null }
//                                  | { type:'then', outputs:{name:value, ...} }
//                                  | { type:'else', outputs:{...} }
import { useState } from 'react';
import { Plus, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import { OPERATORS, formatCellExpression } from './operators';
import { cn } from '@/lib/cn';

interface Cond { field: string; op: string; value?: any; value2?: any }
interface IfBlock { type: 'if'; conditions: Cond[]; orGroups: Cond[][]; then: TreeNode | null; else: TreeNode | null }
interface ThenBlock { type: 'then'; outputs: Record<string, any> }
type TreeNode = IfBlock | ThenBlock;

const newCond = (): Cond => ({ field: '', op: '=', value: '' });
const newIf = (): IfBlock => ({ type: 'if', conditions: [newCond()], orGroups: [], then: null, else: null });
const newThen = (): ThenBlock => ({ type: 'then', outputs: {} });

export function TreeDesigner({
  definition, inputSchema, outputSchema, onChange,
}: {
  definition: any;
  inputSchema?: any;
  outputSchema?: any;
  onChange: (next: any) => void;
}) {
  const [root, setRoot] = useState<TreeNode>(definition?.root || newIf());

  function update(node: TreeNode | null) {
    const next = node || newIf();
    setRoot(next); onChange({ root: next });
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="text-[11px] font-mono text-subtle">
        Build conditions on the left, outcomes on the right. Nest IF blocks inside THEN/ELSE for branching.
      </div>
      <NodeView node={root} onChange={update} inputSchema={inputSchema} outputSchema={outputSchema} depth={0} />
    </div>
  );
}

function NodeView({ node, onChange, inputSchema, outputSchema, depth }: {
  node: TreeNode | null;
  onChange: (n: TreeNode | null) => void;
  inputSchema?: any; outputSchema?: any; depth: number;
}) {
  if (!node) {
    return (
      <div className="ml-2">
        <button
          className="text-xs font-mono text-subtle hover:text-accent border border-dashed border-border rounded px-2 py-1"
          onClick={() => onChange(newIf())}
        >+ Add IF block</button>
        <button
          className="text-xs font-mono text-subtle hover:text-accent border border-dashed border-border rounded px-2 py-1 ml-2"
          onClick={() => onChange(newThen())}
        >+ Outcome</button>
      </div>
    );
  }
  if (node.type === 'then') return <ThenView node={node} onChange={onChange} outputSchema={outputSchema} />;
  return <IfView node={node} onChange={onChange} inputSchema={inputSchema} outputSchema={outputSchema} depth={depth} />;
}

function IfView({ node, onChange, inputSchema, outputSchema, depth }: {
  node: IfBlock; onChange: (n: TreeNode | null) => void;
  inputSchema?: any; outputSchema?: any; depth: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const fields = inputSchema?.properties ? Object.keys(inputSchema.properties) : [];
  const indent = { paddingLeft: `${Math.min(depth * 12, 60)}px` };

  function setConds(conds: Cond[]) { onChange({ ...node, conditions: conds }); }
  function setOrGroup(idx: number, conds: Cond[]) {
    const next = [...node.orGroups];
    next[idx] = conds;
    onChange({ ...node, orGroups: next });
  }
  function addOrGroup() { onChange({ ...node, orGroups: [...node.orGroups, [newCond()]] }); }
  function removeOrGroup(idx: number) { onChange({ ...node, orGroups: node.orGroups.filter((_, i) => i !== idx) }); }

  return (
    <div className="border border-info/30 rounded bg-info/[0.03]" style={indent}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-info/20">
        <button className="btn-ghost p-0" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <span className="font-mono text-[10px] uppercase tracking-label text-info">if</span>
        <button className="ml-auto btn-ghost text-xs text-danger" onClick={() => onChange(null)}>
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {expanded && (
        <div className="p-3 grid grid-cols-2 gap-3">
          {/* LHS: conditions + OR groups */}
          <div className="space-y-2">
            <div className="label-section">conditions (AND)</div>
            <CondList conds={node.conditions} fields={fields} onChange={setConds} />

            {node.orGroups.map((group, i) => (
              <div key={i} className="space-y-1.5 border border-warn/30 bg-warn/5 rounded p-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-label text-warn">OR group {i + 1}</span>
                  <button className="btn-ghost p-0 text-danger" onClick={() => removeOrGroup(i)}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <CondList conds={group} fields={fields} onChange={(c) => setOrGroup(i, c)} />
              </div>
            ))}
            <button className="btn-ghost text-xs" onClick={addOrGroup}>
              <Plus className="h-3 w-3" /> OR group
            </button>
          </div>

          {/* RHS: THEN / ELSE */}
          <div className="space-y-2">
            <div className="label-section text-ok">then</div>
            <NodeView node={node.then} onChange={(t) => onChange({ ...node, then: t })}
              inputSchema={inputSchema} outputSchema={outputSchema} depth={depth + 1} />

            <div className="label-section text-danger pt-2">else</div>
            <NodeView node={node.else} onChange={(t) => onChange({ ...node, else: t })}
              inputSchema={inputSchema} outputSchema={outputSchema} depth={depth + 1} />
          </div>
        </div>
      )}
    </div>
  );
}

function CondList({ conds, fields, onChange }: { conds: Cond[]; fields: string[]; onChange: (c: Cond[]) => void }) {
  function set(i: number, patch: Partial<Cond>) {
    onChange(conds.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  }
  return (
    <>
      {conds.map((c, i) => (
        <div key={i} className="flex items-center gap-1.5 font-mono text-[11px]">
          {fields.length > 0 ? (
            <select
              className="input h-7 text-[11px] py-0 px-1.5 flex-1 min-w-0"
              value={c.field}
              onChange={(e) => set(i, { field: e.target.value })}
            >
              <option value="">field…</option>
              {fields.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          ) : (
            <input className="input h-7 text-[11px] py-0 px-1.5 flex-1" placeholder="field" value={c.field} onChange={(e) => set(i, { field: e.target.value })} />
          )}
          <select className="input h-7 text-[11px] py-0 px-1 w-16" value={c.op} onChange={(e) => set(i, { op: e.target.value })}>
            {OPERATORS.map(o => <option key={o.code} value={o.code}>{o.code}</option>)}
          </select>
          <input className="input h-7 text-[11px] py-0 px-1.5 flex-1 min-w-0" placeholder="value" value={c.value ?? ''} onChange={(e) => set(i, { value: e.target.value })} />
          <button className="btn-ghost p-0.5 text-danger" onClick={() => onChange(conds.filter((_, x) => x !== i))}>
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button className="btn-ghost text-[11px]" onClick={() => onChange([...conds, newCond()])}>
        <Plus className="h-3 w-3" /> condition
      </button>
    </>
  );
}

function ThenView({ node, onChange, outputSchema }: {
  node: ThenBlock; onChange: (n: TreeNode | null) => void; outputSchema?: any;
}) {
  const fields: string[] = outputSchema?.properties ? Object.keys(outputSchema.properties) : Object.keys(node.outputs);
  function set(field: string, value: string) {
    let coerced: any = value;
    if (value === 'true') coerced = true;
    else if (value === 'false') coerced = false;
    else if (/^-?\d+(\.\d+)?$/.test(value)) coerced = Number(value);
    onChange({ ...node, outputs: { ...node.outputs, [field]: coerced } });
  }
  return (
    <div className="border border-ok/30 rounded bg-ok/[0.03] p-2">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-mono text-[10px] uppercase tracking-label text-ok">outcome</span>
        <button className="ml-auto btn-ghost p-0 text-danger" onClick={() => onChange(null)}>
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div className="space-y-1.5">
        {fields.length === 0 && <div className="text-[10px] text-subtle">No output fields. Define an Output Schema first.</div>}
        {fields.map(f => (
          <div key={f} className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="text-subtle min-w-[80px] truncate">{f}</span>
            <span className="text-subtle">=</span>
            <input
              className="input h-7 text-[11px] py-0 px-1.5 flex-1"
              value={node.outputs[f] === undefined ? '' : String(node.outputs[f])}
              onChange={(e) => set(f, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
