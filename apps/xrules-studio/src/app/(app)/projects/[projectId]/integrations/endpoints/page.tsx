'use client';
// Integrations → Endpoints. Two kinds:
//   • Rule endpoint  → POST /api/v1/rules/<slug>/execute
//   • Flow endpoint  → POST /api/v1/flows/<slug>/execute (integration flow,
//                     supports fan-out/fan-in via parallel nodes)
// Per-endpoint OpenAPI 3.1 + ready-to-paste curl/TS/Python snippets.
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Zap, Copy, Check, BookOpen, Workflow } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { StatusPill, Pill } from '@/components/ui/Pill';
import { rulesApi, flowsApi } from '@/lib/api';
import { cn } from '@/lib/cn';

type Tab = 'rule' | 'flow';

export default function EndpointsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [tab, setTab] = useState<Tab>('rule');

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['rules', projectId, 'endpoints'],
    queryFn: () => rulesApi.list(projectId),
  });
  const { data: flows = [], isLoading: flowsLoading } = useQuery({
    queryKey: ['flows', projectId, 'endpoints'],
    queryFn: () => flowsApi.list(projectId),
  });

  const [selected, setSelected] = useState<string | null>(null);
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

  const sortedRules = [...rules].sort((a: any, b: any) => {
    if (a.status === 'published' && b.status !== 'published') return -1;
    if (a.status !== 'published' && b.status === 'published') return 1;
    return a.name.localeCompare(b.name);
  });
  const integrationFlows = (flows as any[]).filter((f) => String(f.kind || 'DECISION').toUpperCase() === 'INTEGRATION');
  const sortedFlows = [...integrationFlows].sort((a: any, b: any) => {
    if (a.status === 'published' && b.status !== 'published') return -1;
    if (a.status !== 'published' && b.status === 'published') return 1;
    return a.name.localeCompare(b.name);
  });

  const items: any[] = tab === 'rule' ? sortedRules : sortedFlows;
  const isLoading = tab === 'rule' ? rulesLoading : flowsLoading;
  const selectedItem = items.find((x: any) => x.id === selected);

  const totalPublished = rules.filter((r: any) => r.status === 'published').length
    + integrationFlows.filter((f: any) => f.status === 'published').length;

  return (
    <PageContent>
      <PageHeader
        title="Endpoints"
        description="Public REST APIs your client apps call. Rules are exposed individually; integration flows wrap fan-in / fan-out logic behind a single endpoint."
        stats={[
          { label: 'Rule endpoints',  value: rules.length },
          { label: 'Flow endpoints',  value: integrationFlows.length },
          { label: 'Published',       value: totalPublished },
        ]}
      />

      <div className="flex items-center gap-3 mb-5">
        <div className="tabs-row">
          <button className={`tab ${tab === 'rule' ? 'tab-active' : ''}`} onClick={() => { setTab('rule'); setSelected(null); }}>
            Rule endpoints
          </button>
          <button className={`tab ${tab === 'flow' ? 'tab-active' : ''}`} onClick={() => { setTab('flow'); setSelected(null); }}>
            Flow endpoints
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[320px_1fr] gap-4">
        {/* Item list */}
        <div className="card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border label-section">
            {tab === 'rule' ? 'Available rules' : 'Available integration flows'}
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            {isLoading && <div className="p-6 text-center text-subtle text-sm">Loading…</div>}
            {!isLoading && items.length === 0 && (
              <div className="p-6 text-center text-subtle text-sm">
                <Zap className="h-8 w-8 mx-auto opacity-40 mb-2" />
                No rules yet — create one in Build → Rules
              </div>
            )}
            {items.map((it: any) => (
              <button
                key={it.id}
                onClick={() => setSelected(it.id)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/40 transition-colors',
                  selected === it.id && 'bg-muted',
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <div className="text-sm font-medium truncate flex items-center gap-2">
                    {tab === 'flow' && <Workflow className="h-3 w-3 text-warn" />}
                    {it.name}
                  </div>
                  <StatusPill status={it.status} />
                </div>
                <div className="text-[11px] font-mono text-subtle truncate">{it.alias || it.slug}</div>
                <div className="text-[10px] font-mono text-subtle/60 mt-1">
                  {tab === 'rule' ? `${it.type?.replace('_', ' ')} · v${it.version}` : `integration · ${it.graph?.nodes?.length || 0} nodes · v${it.version}`}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Endpoint detail */}
        <div className="card">
          {!selectedItem ? (
            <div className="p-12 text-center text-subtle">
              <BookOpen className="h-10 w-10 mx-auto opacity-40 mb-2" />
              <div className="text-sm">Select {tab === 'rule' ? 'a rule' : 'a flow'} on the left to view its endpoint, curl, and SDK code.</div>
            </div>
          ) : tab === 'rule' ? (
            <EndpointDetail rule={selectedItem} baseUrl={baseUrl} />
          ) : (
            <FlowEndpointDetail flow={selectedItem} baseUrl={baseUrl} />
          )}
        </div>
      </div>
    </PageContent>
  );
}

function FlowEndpointDetail({ flow, baseUrl }: { flow: any; baseUrl: string }) {
  const slug = flow.slug;
  const sample = flow.inputSchema ? exampleInput(flow.inputSchema) : {};
  const url = `${baseUrl}/api/v1/flows/${slug}/execute`;
  const isPub = flow.status === 'published';
  const fanoutCount = (flow.graph?.nodes || []).filter((n: any) =>
    ['parallel', 'fanout'].includes(String(n.type || n.data?.kind || '').toLowerCase()),
  ).length;
  const ruleCalls = (flow.graph?.nodes || []).filter((n: any) =>
    String(n.type || n.data?.kind || '').toLowerCase() === 'rulecall',
  ).map((n: any) => n.data?.ruleSlug).filter(Boolean);

  const curlCmd = `curl -X POST '${url}' \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: <YOUR_KEY>' \\
  -d '${JSON.stringify({ input: sample })}'`;

  const tsSnippet = `// Flow endpoints don't have a typed wrapper yet — call via fetch.
const res = await fetch('${url}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.XRULES_API_KEY!,
  },
  body: JSON.stringify({ input: ${JSON.stringify(sample, null, 2).replace(/^/gm, '  ').trim()} }),
});
const { output } = await res.json();
console.log(output);`;

  const [tab2, setTab2] = useState<'curl' | 'ts' | 'graph'>('curl');
  const [copied, setCopied] = useState<string | null>(null);
  function copy(label: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1200);
  }

  return (
    <div>
      <div className="px-5 py-4 border-b border-border/60">
        <div className="flex items-center gap-2 mb-1">
          <Workflow className="h-4 w-4 text-warn" />
          <h3 className="font-semibold">{flow.name}</h3>
          <StatusPill status={flow.status} />
          <span className="pill pill-warn ml-1">integration</span>
          {fanoutCount > 0 && <span className="pill pill-info ml-1">{fanoutCount} fan-out</span>}
        </div>
        {flow.description && <div className="text-[12.5px] text-subtle leading-relaxed">{flow.description}</div>}
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-[11px] text-subtle uppercase tracking-wider font-semibold">POST</span>
          <code className="text-[12px] font-mono">{url}</code>
        </div>
        {!isPub && (
          <div className="mt-2 text-[11px] text-warn">⚠ Not published yet — endpoint returns 400 until you publish the flow.</div>
        )}
        {ruleCalls.length > 0 && (
          <div className="mt-3 text-[11px] text-subtle">
            <span className="font-medium text-text">Calls rules:</span>{' '}
            {ruleCalls.map((s: string, i: number) => (
              <span key={s}>{i > 0 && ', '}<code className="font-mono">{s}</code></span>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-b border-border/60">
        <div className="tabs-row">
          <button className={`tab ${tab2 === 'curl' ? 'tab-active' : ''}`} onClick={() => setTab2('curl')}>curl</button>
          <button className={`tab ${tab2 === 'ts' ? 'tab-active' : ''}`} onClick={() => setTab2('ts')}>typescript</button>
          <button className={`tab ${tab2 === 'graph' ? 'tab-active' : ''}`} onClick={() => setTab2('graph')}>graph</button>
        </div>
      </div>

      <div className="p-5">
        {tab2 === 'curl' && (
          <div className="relative">
            <pre className="font-mono text-[11.5px] bg-muted/40 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed">{curlCmd}</pre>
            <button className="absolute top-2 right-2 btn-ghost text-[10px]" onClick={() => copy('curl', curlCmd)}>
              {copied === 'curl' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        )}
        {tab2 === 'ts' && (
          <div className="relative">
            <pre className="font-mono text-[11.5px] bg-muted/40 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed">{tsSnippet}</pre>
            <button className="absolute top-2 right-2 btn-ghost text-[10px]" onClick={() => copy('ts', tsSnippet)}>
              {copied === 'ts' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        )}
        {tab2 === 'graph' && (
          <pre className="font-mono text-[11px] bg-muted/40 rounded-lg p-3 overflow-x-auto leading-relaxed">{JSON.stringify(flow.graph, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}

function EndpointDetail({ rule, baseUrl }: { rule: any; baseUrl: string }) {
  const slug = rule.alias || rule.slug;
  const url = `${baseUrl}/api/v1/rules/${slug}/v/${rule.version}/execute`;
  const curlCmd = `curl -X POST '${url}' \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: <YOUR_KEY>' \\
  -H 'X-Strategy: STANDARD' \\
  -H 'X-Correlation-Id: req-001' \\
  -d '${JSON.stringify({ data: exampleInput(rule.inputSchema) }, null, 0)}'`;

  const tsSnippet = `import { XRulesClient } from '@xrules/sdk';

const client = new XRulesClient({
  baseUrl: '${baseUrl}',
  apiKey: process.env.XRULES_API_KEY,
});

const result = await client.execute('${slug}', ${JSON.stringify(exampleInput(rule.inputSchema), null, 2).replace(/^/gm, '  ').trim()});

console.log(result.output);`;

  const pySnippet = `from xrules import XRulesClient

client = XRulesClient(
    base_url="${baseUrl}",
    api_key=os.environ["XRULES_API_KEY"],
)

result = client.execute("${slug}", ${pythonDict(exampleInput(rule.inputSchema))})
print(result["output"])`;

  const [tab, setTab] = useState<'curl' | 'ts' | 'python' | 'openapi'>('curl');
  const [copied, setCopied] = useState<string | null>(null);

  const { data: spec } = useQuery({
    queryKey: ['openapi', rule.id],
    queryFn: () => rulesApi.openapi(rule.id),
    enabled: tab === 'openapi',
  });

  const code = tab === 'curl' ? curlCmd
    : tab === 'ts' ? tsSnippet
    : tab === 'python' ? pySnippet
    : JSON.stringify(spec, null, 2);

  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(tab);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-lg font-bold truncate">{rule.name}</h3>
          <StatusPill status={rule.status} />
          <Pill tone="info">v{rule.version}</Pill>
          <Pill tone="subtle">{rule.type?.replace('_', ' ')}</Pill>
        </div>
        <div className="text-xs text-subtle font-mono break-all">
          <span className="text-accent">POST</span> {url}
        </div>
      </div>

      <div className="px-5 py-3 border-b border-border space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono text-subtle w-32">X-API-Key:</span>
          <code className="font-mono bg-muted px-1.5 py-0.5 rounded">required</code>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-subtle w-32">X-Strategy:</span>
          <code className="font-mono bg-muted px-1.5 py-0.5 rounded">STANDARD | FIRST_MATCH | ARRAY | EVALUATE_ALL</code>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-subtle w-32">X-Correlation-Id:</span>
          <code className="font-mono bg-muted px-1.5 py-0.5 rounded">optional, auto-generated if absent</code>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-subtle w-32">X-Audit:</span>
          <code className="font-mono bg-muted px-1.5 py-0.5 rounded">true | false (default: false)</code>
        </div>
      </div>

      <div className="px-5 pt-3 flex items-center gap-2">
        <div className="tabs-row">
          {(['curl', 'ts', 'python', 'openapi'] as const).map(t => (
            <button key={t} className={`tab ${tab === t ? 'tab-active' : ''}`} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
        <button className="btn-ghost text-xs ml-auto" onClick={copy}>
          {copied === tab ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied === tab ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="mx-5 mb-5 mt-2 p-3 bg-muted/30 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-[450px] overflow-y-auto">
        {code}
      </pre>
    </div>
  );
}

function exampleInput(schema: any): any {
  if (!schema?.properties) return {};
  const out: any = {};
  for (const [name, spec] of Object.entries<any>(schema.properties)) {
    if (spec.example !== undefined) { out[name] = spec.example; continue; }
    switch (spec.type) {
      case 'string':  out[name] = '...'; break;
      case 'number':
      case 'integer': out[name] = 0; break;
      case 'boolean': out[name] = false; break;
      case 'array':   out[name] = []; break;
      case 'object':  out[name] = {}; break;
      default:        out[name] = null;
    }
  }
  return out;
}

function pythonDict(obj: any): string {
  if (obj === null) return 'None';
  if (typeof obj === 'boolean') return obj ? 'True' : 'False';
  if (typeof obj === 'string') return `"${obj}"`;
  if (typeof obj === 'number') return String(obj);
  if (Array.isArray(obj)) return `[${obj.map(pythonDict).join(', ')}]`;
  if (typeof obj === 'object') {
    const entries = Object.entries(obj).map(([k, v]) => `"${k}": ${pythonDict(v)}`);
    return `{${entries.join(', ')}}`;
  }
  return 'None';
}
