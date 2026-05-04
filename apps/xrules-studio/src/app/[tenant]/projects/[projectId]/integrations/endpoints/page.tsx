'use client';
// Integrations → Endpoints. Lists every published rule with its public REST URL,
// curl/TS/Python snippets, and a one-click view of the per-rule OpenAPI spec.
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Zap, Copy, Check, BookOpen } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { StatusPill, Pill } from '@/components/ui/Pill';
import { rulesApi } from '@/lib/api';
import { cn } from '@/lib/cn';

export default function EndpointsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['rules', projectId, 'endpoints'],
    queryFn: () => rulesApi.list(projectId),
  });

  const [selected, setSelected] = useState<string | null>(null);
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

  const sortedRules = [...rules].sort((a: any, b: any) => {
    if (a.status === 'published' && b.status !== 'published') return -1;
    if (a.status !== 'published' && b.status === 'published') return 1;
    return a.name.localeCompare(b.name);
  });

  const selectedRule = rules.find((r: any) => r.id === selected);

  return (
    <PageContent>
      <PageHeader
        title="Endpoints"
        description="Every rule is automatically exposed as a REST endpoint with auto-generated OpenAPI 3.1. Pick a rule to copy its curl / SDK snippet."
        stats={[
          { label: 'Published', value: rules.filter((r: any) => r.status === 'published').length },
          { label: 'Total',     value: rules.length },
        ]}
      />

      <div className="grid grid-cols-[320px_1fr] gap-4">
        {/* Rule list */}
        <div className="card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border label-section">Available rules</div>
          <div className="max-h-[600px] overflow-y-auto">
            {isLoading && <div className="p-6 text-center text-subtle text-sm">Loading…</div>}
            {!isLoading && rules.length === 0 && (
              <div className="p-6 text-center text-subtle text-sm">
                <Zap className="h-8 w-8 mx-auto opacity-40 mb-2" />
                No rules yet — create one in Build → Rules
              </div>
            )}
            {sortedRules.map((r: any) => (
              <button
                key={r.id}
                onClick={() => setSelected(r.id)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/40 transition-colors',
                  selected === r.id && 'bg-muted',
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  <StatusPill status={r.status} />
                </div>
                <div className="text-[11px] font-mono text-subtle truncate">{r.alias || r.slug}</div>
                <div className="text-[10px] font-mono text-subtle/60 mt-1">
                  {r.type?.replace('_', ' ')} · v{r.version}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Endpoint detail */}
        <div className="card">
          {!selectedRule ? (
            <div className="p-12 text-center text-subtle">
              <BookOpen className="h-10 w-10 mx-auto opacity-40 mb-2" />
              <div className="text-sm">Select a rule on the left to view its endpoint, curl, and SDK code.</div>
            </div>
          ) : (
            <EndpointDetail rule={selectedRule} baseUrl={baseUrl} />
          )}
        </div>
      </div>
    </PageContent>
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

const result = await client.rules.execute('${slug}', ${JSON.stringify(exampleInput(rule.inputSchema), null, 2).replace(/^/gm, '  ').trim()});

console.log(result.output);`;

  const pySnippet = `from xrules import XRulesClient

client = XRulesClient(
    base_url="${baseUrl}",
    api_key=os.environ["XRULES_API_KEY"],
)

result = client.rules.execute("${slug}", ${pythonDict(exampleInput(rule.inputSchema))})
print(result.output)`;

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
