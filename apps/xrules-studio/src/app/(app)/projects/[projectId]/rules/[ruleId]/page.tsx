'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Sparkles, BookOpen, History, Settings, Code2, ListChecks, Save, Rocket, Lock, Unlock, GitCompare, Check, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { PageContent } from '@/components/layout/AppShell';
import { StatusPill, Pill } from '@/components/ui/Pill';
import { rulesApi, simulationsApi, api } from '@/lib/api';
import { TableDesigner } from '@/components/rule/TableDesigner';
import { TreeDesigner } from '@/components/rule/TreeDesigner';
import { ScriptingDesigner } from '@/components/rule/ScriptingDesigner';
import { LookupDesigner } from '@/components/rule/LookupDesigner';
import { AIAgentDesigner } from '@/components/rule/AIAgentDesigner';
import { ScorecardDesigner } from '@/components/rule/ScorecardDesigner';
import { RuleFlowDesigner } from '@/components/rule/RuleFlowDesigner';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

type TabKey = 'definition' | 'schemas' | 'test' | 'simulate' | 'api' | 'versions' | 'settings';

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'definition', label: 'Definition', icon: Code2 },
  { key: 'schemas',    label: 'Schemas',    icon: ListChecks },
  { key: 'test',       label: 'Test',       icon: Send },
  { key: 'simulate',   label: 'Simulate',   icon: Sparkles },
  { key: 'api',        label: 'API',        icon: BookOpen },
  { key: 'versions',   label: 'Versions',   icon: History },
  { key: 'settings',   label: 'Settings',   icon: Settings },
];

export default function RuleDetailPage() {
  const { projectId, ruleId } = useParams<{ projectId: string; ruleId: string }>();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>('definition');

  const { data: rule, isLoading } = useQuery({
    queryKey: ['rule', ruleId],
    queryFn: () => rulesApi.get(ruleId),
  });

  const publish = useMutation({
    mutationFn: () => rulesApi.publish(ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rule', ruleId] }),
  });

  if (isLoading || !rule) {
    return <PageContent><div className="text-subtle font-mono">Loading…</div></PageContent>;
  }

  return (
    <PageContent>
      {/* Compact header — rule meta + actions */}
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link href={`/projects/${projectId}/rules`} className="text-xs text-subtle font-mono hover:text-text">RULES</Link>
            <span className="text-subtle/50">/</span>
            <span className="font-mono text-xs text-subtle">{rule.slug}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight truncate">{rule.name}</h1>
            <StatusPill status={rule.status} />
            <Pill tone="info">v{rule.version}</Pill>
            <Pill tone="subtle">{rule.type?.replace('_', ' ')}</Pill>
            {rule.alias && <Pill tone="mint">@{rule.alias}</Pill>}
            {rule.locked && <Pill tone="warn"><Lock className="h-2.5 w-2.5 inline mr-0.5" />locked</Pill>}
            <Pill tone="subtle">strategy: {rule.strategy || 'standard'}</Pill>
          </div>
          {rule.description && <p className="text-sm text-subtle mt-1">{rule.description}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button className="btn-ghost text-xs" onClick={() => {
            const evt = new CustomEvent('xrules:open-compare', { detail: { ruleId: rule.id } });
            window.dispatchEvent(evt);
          }} title="Compare versions">
            <GitCompare className="h-3.5 w-3.5" />
          </button>
          <button className="btn-ghost text-xs" onClick={async () => {
            await api.patch(rule.locked ? `/rules/${rule.id}/unlock` : `/rules/${rule.id}/lock`);
            qc.invalidateQueries({ queryKey: ['rule', rule.id] });
          }} title={rule.locked ? 'Unlock' : 'Lock'}>
            {rule.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          </button>
          <button className="btn-primary" onClick={() => publish.mutate()} disabled={publish.isPending || rule.locked}>
            <Rocket className="h-3.5 w-3.5" />
            {publish.isPending ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>

      <CompareModal ruleId={rule.id} currentVersion={rule.version} />

      {/* Tabs */}
      <div className="tabs-row mb-6">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`tab inline-flex items-center gap-1.5 ${tab === key ? 'tab-active' : ''}`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'definition' && <DefinitionTab rule={rule} projectId={projectId} />}
      {tab === 'schemas'    && <SchemasTab    rule={rule} />}
      {tab === 'test'       && <TestTab       rule={rule} />}
      {tab === 'simulate'   && <SimulateTab   rule={rule} projectId={projectId} />}
      {tab === 'api'        && <ApiTab        rule={rule} />}
      {tab === 'versions'   && <VersionsTab   ruleId={ruleId} />}
      {tab === 'settings'   && <SettingsTab   rule={rule} />}
    </PageContent>
  );
}

// =============================================================================

function DefinitionTab({ rule, projectId }: { rule: any; projectId: string }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (patch: any) => rulesApi.update(rule.id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rule', rule.id] }),
  });
  const t = String(rule.type || '').toUpperCase();

  if (t === 'DECISION_TABLE') {
    return (
      <TableDesigner
        definition={rule.definition}
        inputSchema={rule.inputSchema}
        outputSchema={rule.outputSchema}
        onChange={(def) => mut.mutate({ definition: def })}
      />
    );
  }
  if (t === 'DECISION_TREE') {
    return (
      <TreeDesigner
        definition={rule.definition}
        inputSchema={rule.inputSchema}
        outputSchema={rule.outputSchema}
        onChange={(def) => mut.mutate({ definition: def })}
      />
    );
  }
  if (t === 'SCRIPT' || t === 'FORMULA') {
    return (
      <ScriptingDesigner
        definition={rule.definition}
        ruleVariables={rule.ruleVariables}
        onChange={(def) => mut.mutate({ definition: def })}
        onVariablesChange={(vars) => mut.mutate({ ruleVariables: vars })}
      />
    );
  }
  if (t === 'LOOKUP') {
    return (
      <LookupDesigner
        definition={rule.definition}
        onChange={(def) => mut.mutate({ definition: def })}
      />
    );
  }
  if (t === 'AI_AGENT') {
    return (
      <AIAgentDesigner
        definition={rule.definition}
        projectId={projectId}
        inputSchema={rule.inputSchema}
        ruleVariables={rule.ruleVariables}
        onChange={(def) => mut.mutate({ definition: def })}
      />
    );
  }
  if (t === 'SCORECARD') {
    return (
      <ScorecardDesigner
        definition={rule.definition}
        onChange={(def) => mut.mutate({ definition: def })}
      />
    );
  }
  if (t === 'RULE_FLOW') {
    return (
      <RuleFlowDesigner
        definition={rule.definition}
        onChange={(def) => mut.mutate({ definition: def })}
      />
    );
  }

  // Fallback raw JSON for any other type (MODEL_CALL etc.)
  return <RawJsonDefinition rule={rule} onSave={(d) => mut.mutate({ definition: d })} />;
}

function RawJsonDefinition({ rule, onSave }: { rule: any; onSave: (d: any) => void }) {
  const [val, setVal] = useState(JSON.stringify(rule.definition || {}, null, 2));
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <span className="label-section">{rule.type?.toLowerCase().replace('_', ' ')} · raw json</span>
        <button className="btn-ghost text-xs" onClick={() => {
          try { onSave(JSON.parse(val)); setError(null); } catch (e: any) { setError(e.message); }
        }}>Save</button>
      </div>
      <MonacoEditor
        height="540px"
        language="json"
        value={val}
        onChange={(v) => setVal(v || '')}
        options={{ minimap: { enabled: false }, fontSize: 13 }}
      />
      {error && <div className="px-4 py-2 pill pill-danger m-3">{error}</div>}
    </div>
  );
}

function SchemasTab({ rule }: { rule: any }) {
  const [input, setInput] = useState(JSON.stringify(rule.inputSchema || { type: 'object', properties: {} }, null, 2));
  const [output, setOutput] = useState(JSON.stringify(rule.outputSchema || { type: 'object', properties: {} }, null, 2));
  const mut = useMutation({
    mutationFn: () => {
      const i = JSON.parse(input);
      const o = JSON.parse(output);
      return rulesApi.update(rule.id, { inputSchema: i, outputSchema: o });
    },
  });
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border label-section">Input Schema · JSON Schema 2020-12</div>
        <MonacoEditor height="500px" language="json" value={input} onChange={(v) => setInput(v || '')}
          options={{ minimap: { enabled: false }, fontSize: 13 }} />
      </div>
      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border label-section">Output Schema</div>
        <MonacoEditor height="500px" language="json" value={output} onChange={(v) => setOutput(v || '')}
          options={{ minimap: { enabled: false }, fontSize: 13 }} />
      </div>
      <div className="col-span-2 flex justify-end">
        <button className="btn-primary" onClick={() => mut.mutate()} disabled={mut.isPending}>
          <Save className="h-3.5 w-3.5" />
          {mut.isPending ? 'Saving…' : 'Save Schemas'}
        </button>
      </div>
    </div>
  );
}

function TestTab({ rule }: { rule: any }) {
  const sampleInput = useMemo(() => sampleFromSchema(rule.inputSchema), [rule.inputSchema]);
  const [input, setInput] = useState(() => JSON.stringify(sampleInput, null, 2));
  const [output, setOutput] = useState<any>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true); setError(null); setOutput(null); setExecutionId(null);
    try {
      const t0 = Date.now();
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('xrules_token')}` },
        body: JSON.stringify({ rule_id: rule.id, input: JSON.parse(input), context: {} }),
      });
      const json = await res.json();
      setDuration(Date.now() - t0);
      if (!json.success && json.error) {
        setError(json.error.message || 'Failed');
      } else {
        const data = json.data || json;
        setOutput(data.output);
        setExecutionId(data.id || null);
        // Persist trace globally so TableDesigner picks it up on remount.
        try {
          (window as any).__xrulesLastTrace = { ruleId: rule.id, input: JSON.parse(input), output: data.output };
        } catch {}
        window.dispatchEvent(new CustomEvent('xrules:test-trace', {
          detail: { ruleId: rule.id, output: data.output, input: JSON.parse(input) }
        }));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    setInput(JSON.stringify(sampleInput, null, 2));
    setOutput(null); setError(null); setDuration(null); setExecutionId(null);
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="label-section">Input JSON</span>
            <button onClick={reset} className="btn-ghost text-[11px] text-subtle hover:text-text">reset</button>
          </div>
          <button onClick={run} disabled={running} className="btn-primary text-xs disabled:opacity-50">
            <Send className="h-3 w-3" />
            {running ? 'Running…' : 'Run'}
          </button>
        </div>
        <MonacoEditor height="450px" language="json" value={input} onChange={(v) => setInput(v || '{}')}
          options={{ minimap: { enabled: false }, fontSize: 13 }} />
      </div>
      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <span className="label-section">Output</span>
          <div className="flex items-center gap-3 font-mono text-[11px] text-subtle tabular-nums">
            {duration !== null && <span>{duration}ms</span>}
            {executionId && <span className="opacity-60">{executionId.slice(0, 10)}…</span>}
          </div>
        </div>
        <div className="p-4 h-[450px] overflow-auto font-mono text-xs">
          {error && (
            <div className="pill pill-danger mb-2">
              <X className="h-3 w-3" /> {error}
            </div>
          )}
          {output !== null && output !== undefined && (
            <>
              <div className="pill pill-ok mb-2">
                <Check className="h-3 w-3" /> Success
              </div>
              <pre className="text-text whitespace-pre-wrap leading-relaxed">{JSON.stringify(output, null, 2)}</pre>
            </>
          )}
          {output === null && !error && !running && (
            <div className="text-subtle">
              Click <span className="font-medium text-text">Run</span> to execute the rule with the input on the left.
              <div className="text-[10px] mt-2 opacity-70">
                Sample input is pre-filled from the rule's input schema.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Generate a plausible sample object from a JSON Schema 2020-12 subset.
function sampleFromSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return {};
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.type === 'object' || schema.properties) {
    const out: any = {};
    for (const [k, v] of Object.entries<any>(schema.properties || {})) {
      out[k] = sampleFromSchema(v);
    }
    return out;
  }
  if (schema.type === 'array') return [sampleFromSchema(schema.items || {})];
  if (schema.type === 'string') return schema.enum?.[0] || schema.format === 'date-time' ? new Date().toISOString() : '';
  if (schema.type === 'number' || schema.type === 'integer') return schema.minimum ?? 0;
  if (schema.type === 'boolean') return false;
  if (schema.enum) return schema.enum[0];
  return null;
}

function SimulateTab({ rule, projectId }: { rule: any; projectId: string }) {
  const [mode, setMode] = useState<'diff' | 'replay' | 'sweep'>('diff');
  const [versionA, setVersionA] = useState(1);
  const [versionB, setVersionB] = useState(rule.version);
  const [input, setInput] = useState('{}');
  const [result, setResult] = useState<any>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true); setResult(null);
    try {
      const body: any = { projectId, ruleId: rule.id, name: `${mode} ${rule.slug}` };
      if (mode === 'diff') Object.assign(body, { versionA, versionB, input: JSON.parse(input) });
      if (mode === 'replay') Object.assign(body, { versionA, versionB, sampleSize: 50 });
      if (mode === 'sweep') Object.assign(body, { version: rule.version, baseInput: JSON.parse(input), axis: 'value', values: [1, 2, 3, 4, 5] });
      const res = await (mode === 'diff' ? simulationsApi.diff(body) : mode === 'replay' ? simulationsApi.replay(body) : simulationsApi.sweep(body));
      setResult(res);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="tabs-row mb-4">
          {(['diff', 'replay', 'sweep'] as const).map((m) => (
            <button key={m} className={`tab ${mode === m ? 'tab-active' : ''}`} onClick={() => setMode(m)}>
              {m}
            </button>
          ))}
        </div>

        {mode === 'diff' && (
          <div className="space-y-3">
            <p className="text-xs text-subtle">Run the same input through two versions side-by-side.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-section block mb-1.5">Version A</label>
                <input type="number" className="input w-full" value={versionA} onChange={(e) => setVersionA(Number(e.target.value))} />
              </div>
              <div>
                <label className="label-section block mb-1.5">Version B</label>
                <input type="number" className="input w-full" value={versionB} onChange={(e) => setVersionB(Number(e.target.value))} />
              </div>
            </div>
            <div>
              <label className="label-section block mb-1.5">Input JSON</label>
              <MonacoEditor height="180px" language="json" value={input} onChange={(v) => setInput(v || '{}')}
                options={{ minimap: { enabled: false }, fontSize: 13 }} />
            </div>
          </div>
        )}

        {mode === 'replay' && (
          <div className="space-y-3">
            <p className="text-xs text-subtle">Replay last 50 production executions on version A vs B. See how many diverge.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-section block mb-1.5">Version A (champion)</label>
                <input type="number" className="input w-full" value={versionA} onChange={(e) => setVersionA(Number(e.target.value))} />
              </div>
              <div>
                <label className="label-section block mb-1.5">Version B (challenger)</label>
                <input type="number" className="input w-full" value={versionB} onChange={(e) => setVersionB(Number(e.target.value))} />
              </div>
            </div>
          </div>
        )}

        {mode === 'sweep' && (
          <div className="space-y-3">
            <p className="text-xs text-subtle">Vary one axis to see output curve (sensitivity analysis).</p>
            <div>
              <label className="label-section block mb-1.5">Base Input</label>
              <MonacoEditor height="180px" language="json" value={input} onChange={(v) => setInput(v || '{}')}
                options={{ minimap: { enabled: false }, fontSize: 13 }} />
            </div>
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button className="btn-primary" onClick={run} disabled={running}>
            <Sparkles className="h-3.5 w-3.5" />
            {running ? 'Running…' : 'Run simulation'}
          </button>
        </div>
      </div>

      {result && (
        <div className="card p-4">
          <div className="label-section mb-2">Result</div>
          <pre className="font-mono text-xs whitespace-pre-wrap text-text overflow-auto max-h-[400px]">{JSON.stringify(result.result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

function ApiTab({ rule }: { rule: any }) {
  const url = `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'}/api/v1/rules/${rule.slug || rule.id}/execute`;
  const curl = `curl -X POST '${url}' \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: YOUR_API_KEY' \\
  -d '${JSON.stringify({ input: {} })}'`;

  const ts = `import { XRulesClient } from '@xrules/sdk';

const client = new XRulesClient({
  baseUrl: '${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'}',
  apiKey: process.env.XRULES_API_KEY!,
});

const result = await client.execute('${rule.slug}', { /* input */ });
console.log(result.output);`;

  const py = `from xrules import XRulesClient

client = XRulesClient(
    base_url="${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'}",
    api_key=os.environ["XRULES_API_KEY"],
)

result = client.execute("${rule.slug}", {})
print(result["output"])`;

  const [tab, setTab] = useState<'curl' | 'ts' | 'python' | 'openapi'>('curl');

  const { data: spec } = useQuery({
    queryKey: ['openapi', rule.id],
    queryFn: () => rulesApi.openapi(rule.id),
    enabled: tab === 'openapi',
  });

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="label-section mb-2">Execute Endpoint</div>
        <div className="font-mono text-sm bg-muted p-3 rounded mb-3 break-all">
          <span className="text-accent">POST</span>{' '}
          <span className="text-text">{url}</span>
        </div>
        <p className="text-xs text-subtle">
          Authentication via <code className="font-mono text-text bg-muted px-1.5 py-0.5 rounded">X-API-Key</code> header.
          Input validated against the rule&apos;s Input Schema.
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 border-b border-border tabs-row mt-2 mb-2 ml-4">
          {(['curl', 'ts', 'python', 'openapi'] as const).map((t) => (
            <button key={t} className={`tab ${tab === t ? 'tab-active' : ''}`} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
        <pre className="p-4 overflow-x-auto text-xs font-mono text-text bg-muted/30 m-0">
          {tab === 'curl' ? curl : tab === 'ts' ? ts : tab === 'python' ? py : JSON.stringify(spec, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function VersionsTab({ ruleId }: { ruleId: string }) {
  const { data: versions = [] } = useQuery({
    queryKey: ['rule-versions', ruleId],
    queryFn: () => rulesApi.versions(ruleId),
  });
  if (!versions.length) return <div className="card p-8 text-center text-subtle text-sm">No published versions yet</div>;
  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted/30 border-b border-border">
          <tr className="text-left">
            <th className="py-3 px-4 label-section w-12">#</th>
            <th className="py-3 px-4 label-section">Version</th>
            <th className="py-3 px-4 label-section">Status</th>
            <th className="py-3 px-4 label-section">Message</th>
            <th className="py-3 px-4 label-section text-right">Created</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v: any, i: number) => (
            <tr key={v.id} className="border-b border-border/50">
              <td className="py-3 px-4 row-index">{String(i + 1).padStart(2, '0')}</td>
              <td className="py-3 px-4 font-mono">v{v.version}</td>
              <td className="py-3 px-4"><StatusPill status={v.status} /></td>
              <td className="py-3 px-4 text-sm text-subtle">{v.message || '—'}</td>
              <td className="py-3 px-4 text-right font-mono text-xs text-subtle tabular-nums">
                {new Date(v.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettingsTab({ rule }: { rule: any }) {
  return (
    <div className="card p-6 space-y-4">
      <div>
        <label className="label-section block mb-1.5">Slug</label>
        <input className="input w-full max-w-md font-mono" defaultValue={rule.slug} disabled />
      </div>
      <div>
        <label className="label-section block mb-1.5">Engine</label>
        <input className="input w-full max-w-md font-mono" defaultValue={rule.engine} disabled />
      </div>
      <div>
        <label className="label-section block mb-1.5">Tags</label>
        <input className="input w-full max-w-md" placeholder="e.g. pricing, kyc" defaultValue={(rule.tags || []).join(', ')} />
      </div>
      <div className="pt-4 border-t border-border">
        <button className="btn-outline text-danger border-danger/30 hover:bg-danger/10">Archive rule</button>
      </div>
    </div>
  );
}


function CompareModal({ ruleId, currentVersion }: { ruleId: string; currentVersion: number }) {
  const [open, setOpen] = useState(false);
  const [a, setA] = useState(1);
  const [b, setB] = useState(currentVersion);
  const [data, setData] = useState<any>(null);

  if (typeof window !== "undefined") {
    window.addEventListener("xrules:open-compare", (e: any) => {
      if (e.detail?.ruleId === ruleId) setOpen(true);
    });
  }

  async function run() {
    const res = await api.get<any>(`/rules/${ruleId}/compare?a=${a}&b=${b}`);
    setData(res);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50" onClick={() => setOpen(false)}>
      <div className="card w-full max-w-4xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border flex items-center gap-3">
          <h2 className="font-bold">Compare Versions</h2>
          <input type="number" className="input h-7 w-20 text-xs" value={a} onChange={(e) => setA(Number(e.target.value))} />
          <span className="text-subtle">vs</span>
          <input type="number" className="input h-7 w-20 text-xs" value={b} onChange={(e) => setB(Number(e.target.value))} />
          <button className="btn-primary text-xs" onClick={run}>Diff</button>
          <button className="btn-ghost ml-auto text-xs" onClick={() => setOpen(false)}>Close</button>
        </div>
        <div className="flex-1 overflow-auto p-4 grid grid-cols-2 gap-4 font-mono text-xs">
          <div>
            <div className="label-section mb-1">v{a}</div>
            <pre className="bg-muted p-3 rounded whitespace-pre-wrap">{data ? JSON.stringify(data.a?.definition, null, 2) : "(run diff)"}</pre>
          </div>
          <div>
            <div className="label-section mb-1">v{b}</div>
            <pre className="bg-muted p-3 rounded whitespace-pre-wrap">{data ? JSON.stringify(data.b?.definition, null, 2) : "(run diff)"}</pre>
          </div>
          {data?.diff?.definition && (
            <div className="col-span-2">
              <div className="label-section mb-1">Changes ({data.diff.definition.length})</div>
              <ul className="space-y-1">
                {data.diff.definition.map((d: any, i: number) => (
                  <li key={i} className={`text-[11px] ${d.op === "add" ? "text-ok" : d.op === "remove" ? "text-danger" : "text-warn"}`}>
                    [{d.op}] {d.path}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

