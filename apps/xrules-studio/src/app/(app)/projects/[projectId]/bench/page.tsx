'use client';
// Bench — micro-benchmark a single rule by running it N times against the
// same input and reporting p50 / p95 / p99 / mean / qps.
// Pure client-side timing of /execute/:ruleId calls.
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Gauge, Play, AlertCircle } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { TestNav } from '@/components/layout/TestNav';
import { rulesApi, executeApi } from '@/lib/api';

interface Result { ms: number; ok: boolean; error?: string }

export default function BenchPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [ruleId, setRuleId] = useState<string>('');
  const [iterations, setIterations] = useState(100);
  const [concurrency, setConcurrency] = useState(1);
  const [input, setInput] = useState('{}');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data: rules = [] } = useQuery({
    queryKey: ['rules', projectId],
    queryFn: () => rulesApi.list(projectId),
  });

  async function run() {
    setError(null);
    setResults([]);
    setProgress(0);
    if (!ruleId) { setError('Pick a rule first'); return; }
    let parsed: any;
    try { parsed = JSON.parse(input); } catch (e: any) { setError('Invalid input JSON: ' + e.message); return; }
    setRunning(true);

    const all: Result[] = [];
    let nextI = 0;
    async function worker() {
      while (nextI < iterations) {
        const i = nextI++;
        const t0 = performance.now();
        try {
          await executeApi.run(ruleId, parsed, {});
          all.push({ ms: performance.now() - t0, ok: true });
        } catch (e: any) {
          all.push({ ms: performance.now() - t0, ok: false, error: String(e?.message || e) });
        }
        setProgress(all.length);
      }
    }
    const workers = Array.from({ length: Math.max(1, Math.min(concurrency, 32)) }, () => worker());
    await Promise.all(workers);
    setResults(all);
    setRunning(false);
  }

  const stats = computeStats(results);
  const failed = results.filter(r => !r.ok).length;

  return (
    <PageContent>
      <PageHeader
        title="Test"
        description="Validate rules before they ship — assertion suites, sample data, version diff and replay, and latency benchmarks"
        stats={[
          { label: 'Rules',    value: rules.length },
          { label: 'Last run', value: results.length },
        ]}
      />
      <TestNav />

      <div className="grid grid-cols-[360px_1fr] gap-3">
        {/* SETTINGS */}
        <div className="card p-3 space-y-4">
          <div className="flex items-center gap-2">
            <Gauge className="h-3.5 w-3.5 text-accent" />
            <span className="label-section">Settings</span>
          </div>

          <div>
            <label className="label-section block mb-1.5">Rule</label>
            <select
              className="input w-full"
              value={ruleId}
              onChange={(e) => setRuleId(e.target.value)}
            >
              <option value="">— pick a rule —</option>
              {rules.map((r: any) => (
                <option key={r.id} value={r.id}>
                  [{r.type.replace('_', ' ').toLowerCase()}] {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label-section block mb-1.5">Iterations</label>
              <input
                type="number"
                className="input w-full"
                min={1} max={10000} step={10}
                value={iterations}
                onChange={(e) => setIterations(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label-section block mb-1.5">Concurrency</label>
              <input
                type="number"
                className="input w-full"
                min={1} max={32}
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
              />
              <div className="font-mono text-[9px] text-subtle mt-0.5">parallel workers in browser</div>
            </div>
          </div>

          <div>
            <label className="label-section block mb-1.5">Input JSON</label>
            <textarea
              className="input w-full font-mono text-xs h-32"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </div>

          {error && (
            <div className="pill pill-danger flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3" /> {error}
            </div>
          )}

          <button
            className="btn-primary w-full disabled:opacity-50"
            disabled={running || !ruleId}
            onClick={run}
          >
            <Play className="h-3.5 w-3.5" />
            {running ? `Running… ${progress}/${iterations}` : 'Run benchmark'}
          </button>
        </div>

        {/* RESULTS */}
        <div className="space-y-3">
          {!running && results.length === 0 && (
            <div className="card p-12 text-center">
              <Gauge className="h-12 w-12 mx-auto text-subtle/40 mb-3" />
              <div className="text-sm text-subtle">No results yet — run a benchmark to see latency stats.</div>
            </div>
          )}

          {running && (
            <div className="card p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="label-section">Progress</span>
                <span className="font-mono text-xs tabular-nums">{progress} / {iterations}</span>
              </div>
              <div className="h-2 bg-muted rounded overflow-hidden">
                <div className="h-full bg-accent transition-all" style={{ width: `${(progress / iterations) * 100}%` }} />
              </div>
            </div>
          )}

          {results.length > 0 && (
            <>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                <Stat label="count">{results.length}</Stat>
                <Stat label="ok">{results.length - failed}</Stat>
                <Stat label="failed" tone={failed > 0 ? 'danger' : undefined}>{failed}</Stat>
                <Stat label="qps">{stats.qps.toFixed(1)}</Stat>
                <Stat label="mean ms">{stats.mean.toFixed(2)}</Stat>
                <Stat label="stddev">{stats.std.toFixed(2)}</Stat>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                <Stat label="min ms">{stats.min.toFixed(2)}</Stat>
                <Stat label="p50 ms">{stats.p50.toFixed(2)}</Stat>
                <Stat label="p95 ms" tone="warn">{stats.p95.toFixed(2)}</Stat>
                <Stat label="p99 ms" tone="warn">{stats.p99.toFixed(2)}</Stat>
                <Stat label="max ms">{stats.max.toFixed(2)}</Stat>
              </div>

              <div className="card p-3">
                <span className="label-section block mb-2">Distribution</span>
                <Histogram values={results.filter(r => r.ok).map(r => r.ms)} />
              </div>

              {failed > 0 && (
                <div className="card p-3">
                  <span className="label-section block mb-2">Errors ({failed})</span>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {results.filter(r => !r.ok).slice(0, 50).map((r, i) => (
                      <div key={i} className="font-mono text-[10px] text-danger truncate">
                        {r.ms.toFixed(1)}ms · {r.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </PageContent>
  );
}

function Stat({ label, children, tone }: { label: string; children: React.ReactNode; tone?: 'warn' | 'danger' }) {
  const cls = tone === 'danger' ? 'text-danger'
            : tone === 'warn'   ? 'text-warn'
            : '';
  return (
    <div className="border border-border rounded p-2 bg-surface">
      <div className="label-section text-[9px]">{label}</div>
      <div className={`mt-0.5 font-mono text-base font-medium tabular-nums ${cls}`}>{children}</div>
    </div>
  );
}

function Histogram({ values }: { values: number[] }) {
  if (values.length === 0) return <div className="text-xs text-subtle">no data</div>;
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const BUCKETS = 24;
  const span = Math.max(max - min, 0.01);
  const buckets = new Array(BUCKETS).fill(0);
  for (const v of values) {
    const idx = Math.min(BUCKETS - 1, Math.floor(((v - min) / span) * BUCKETS));
    buckets[idx]++;
  }
  const peak = Math.max(...buckets);
  return (
    <div>
      <div className="flex items-end gap-px h-20">
        {buckets.map((b, i) => (
          <div
            key={i}
            className="flex-1 bg-accent/70 hover:bg-accent transition-colors"
            style={{ height: `${(b / peak) * 100}%` }}
            title={`${b} samples`}
          />
        ))}
      </div>
      <div className="flex justify-between font-mono text-[9px] text-subtle mt-1">
        <span>{min.toFixed(1)}ms</span>
        <span>{max.toFixed(1)}ms</span>
      </div>
    </div>
  );
}

function computeStats(rs: Result[]) {
  const ok = rs.filter(r => r.ok).map(r => r.ms);
  if (ok.length === 0) return { mean: 0, std: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0, qps: 0 };
  const sorted = [...ok].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  const variance = sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / sorted.length;
  const std = Math.sqrt(variance);
  // QPS estimate: total wall time ≈ sum / concurrency_used; we approximate as 1000 / mean for serial-equivalent throughput
  const qps = mean > 0 ? 1000 / mean : 0;
  return {
    mean, std,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p50: pct(sorted, 0.50),
    p95: pct(sorted, 0.95),
    p99: pct(sorted, 0.99),
    qps,
  };
}
function pct(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}
