'use client';
// Scripting Rule designer — Monaco JS editor + Rule Variables sidebar.
// Definition shape: { source: string, language: 'javascript' }
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Trash2 } from 'lucide-react';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

const STARTER = `// Build the output object and return it. The runtime injects:
//   input         — request payload typed by your Input Schema
//   ruleVariables — values defined in the right sidebar
//   DR.solve(slugOrId, payload) — call another rule and use its output
//
// You MUST end with: return output;

const score = input.amount * 0.1 + (input.tier === 'platinum' ? 100 : 0);
const output = {
  approved: score > 50,
  score,
};
return output;
`;

interface RuleVar { name: string; value: string }

export function ScriptingDesigner({
  definition, ruleVariables, onChange, onVariablesChange,
}: {
  definition: any;
  ruleVariables: any;
  onChange: (next: any) => void;
  onVariablesChange: (vars: Record<string, any>) => void;
}) {
  const [source, setSource] = useState<string>(definition?.source || STARTER);
  const initialVars: RuleVar[] = ruleVariables
    ? Object.entries(ruleVariables).map(([name, value]) => ({ name, value: typeof value === 'string' ? value : JSON.stringify(value) }))
    : [];
  const [vars, setVars] = useState<RuleVar[]>(initialVars);

  function emitSource(s: string) { setSource(s); onChange({ source: s, language: 'javascript' }); }
  function emitVars(next: RuleVar[]) {
    setVars(next);
    const obj: Record<string, any> = {};
    for (const v of next) {
      try { obj[v.name] = JSON.parse(v.value); }
      catch { obj[v.name] = v.value; }
    }
    onVariablesChange(obj);
  }

  return (
    <div className="grid grid-cols-[1fr_280px] gap-3">
      <div className="card overflow-hidden">
        <div className="px-4 py-2 border-b border-border flex items-center gap-2">
          <span className="label-section">JavaScript</span>
          <span className="ml-auto font-mono text-[10px] text-subtle">return output; required</span>
        </div>
        <MonacoEditor
          height="540px"
          language="javascript"
          value={source}
          onChange={(v) => emitSource(v || '')}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: 'JetBrains Mono, monospace',
            tabSize: 2,
            renderLineHighlight: 'gutter',
          }}
        />
      </div>

      <div className="card p-3 space-y-3">
        <div className="flex items-center">
          <span className="label-section">Rule Variables</span>
          <button className="btn-ghost text-xs ml-auto" onClick={() => emitVars([...vars, { name: `var${vars.length + 1}`, value: '""' }])}>
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
        <div className="text-[10px] font-mono text-subtle">
          Access via <code className="bg-muted px-1 rounded">ruleVariables.&lt;name&gt;</code>. Values are JSON-parsed (use quotes for strings).
        </div>
        {vars.length === 0 && <div className="text-xs text-subtle">No variables yet.</div>}
        {vars.map((v, i) => (
          <div key={i} className="space-y-1.5 border border-border rounded p-2">
            <div className="flex items-center gap-1">
              <input
                className="input h-7 text-xs flex-1 font-mono"
                placeholder="name"
                value={v.name}
                onChange={(e) => emitVars(vars.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}
              />
              <button className="btn-ghost text-danger p-0.5" onClick={() => emitVars(vars.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            <textarea
              className="input w-full text-xs h-16 font-mono py-1.5"
              placeholder='"hello" or 42 or [1,2,3]'
              value={v.value}
              onChange={(e) => emitVars(vars.map((x, idx) => idx === i ? { ...x, value: e.target.value } : x))}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
