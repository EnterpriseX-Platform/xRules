'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, FileText, Workflow, FolderKanban, Brain } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { dashboardApi } from '@/lib/api';
import { useAuth } from '@/lib/store';

export default function DashboardPage() {
  const wsSlug = useAuth((s: any) => s.workspace?.slug || s.user?.tenantId || '');

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', wsSlug],
    queryFn: () => dashboardApi.get(wsSlug),
    retry: false,
  });

  const raw = data?.stats || {};
  const stats = {
    projects:   raw.projects   ?? raw.projectCount   ?? 0,
    rules:      raw.rules      ?? raw.ruleCount      ?? 0,
    flows:      raw.flows      ?? raw.flowCount      ?? 0,
    models:     raw.models     ?? raw.modelCount     ?? 0,
    executions: raw.executions ?? raw.executionCount ?? 0,
  };

  return (
    <PageContent>
      <PageHeader
        title="Dashboard"
        description="Overview of decisions executed across your workspace"
        stats={[
          { label: 'Projects',    value: stats.projects },
          { label: 'Rules',       value: stats.rules },
          { label: 'Flows',       value: stats.flows },
          { label: 'Executions',  value: stats.executions },
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Projects" value={stats.projects} icon={FolderKanban} tone="info" />
        <KpiCard label="Rules"    value={stats.rules}    icon={FileText}     tone="info" />
        <KpiCard label="Flows"    value={stats.flows}    icon={Workflow}     tone="mint" />
        <KpiCard label="Models"   value={stats.models}   icon={Brain}        tone="warn" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-mono uppercase tracking-label text-subtle">Recent Executions</h2>
            <span className="font-mono text-[10px] text-subtle tabular-nums">{Number(stats.executions).toLocaleString()} TOTAL</span>
          </div>
          <RecentTable rows={data?.recentExecutions || []} loading={isLoading} />
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-mono uppercase tracking-label text-subtle mb-4">Recent Projects</h2>
          <ProjectList rows={data?.recentProjects || []} loading={isLoading} />
        </div>
      </div>
    </PageContent>
  );
}

function KpiCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: 'info' | 'mint' | 'warn' }) {
  const toneCls = tone === 'info' ? 'text-info bg-info/10' : tone === 'mint' ? 'text-mint bg-mint/10' : 'text-warn bg-warn/10';
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`h-10 w-10 rounded flex items-center justify-center ${toneCls}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <div className="text-xs text-subtle font-mono uppercase tracking-label">{label}</div>
      </div>
    </div>
  );
}

function RecentTable({ rows, loading }: { rows: any[]; loading: boolean }) {
  if (loading) return <SkeletonRows />;
  if (!rows.length) return <Empty icon={Activity} text="No recent executions" />;
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-border">
        <tr className="text-left">
          <th className="py-2 pr-4 label-section">#</th>
          <th className="py-2 pr-4 label-section">Rule</th>
          <th className="py-2 pr-4 label-section">Status</th>
          <th className="py-2 pr-4 label-section text-right">Duration</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 5).map((r, i) => (
          <tr key={r.id} className="border-b border-border/50">
            <td className="py-2.5 pr-4 row-index">{String(i + 1).padStart(2, '0')}</td>
            <td className="py-2.5 pr-4 truncate max-w-[200px]">{r.rule?.name || '—'}</td>
            <td className="py-2.5 pr-4">
              <span className={`pill ${r.status === 'SUCCESS' ? 'pill-ok' : r.status === 'FAILED' ? 'pill-danger' : 'pill-warn'}`}>
                <span className={`dot ${r.status === 'SUCCESS' ? 'bg-ok' : r.status === 'FAILED' ? 'bg-danger' : 'bg-warn'}`} />
                {r.status}
              </span>
            </td>
            <td className="py-2.5 pr-4 text-right font-mono text-xs text-subtle tabular-nums">
              {r.duration ? `${r.duration}ms` : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProjectList({ rows, loading }: { rows: any[]; loading: boolean }) {
  if (loading) return <SkeletonRows />;
  if (!rows.length) return <Empty icon={FolderKanban} text="No projects yet" />;
  return (
    <div className="space-y-2">
      {rows.slice(0, 6).map((p) => (
        <a
          key={p.id}
          href={`/projects/${p.slug || p.id}/rules`}
          className="flex items-center gap-3 p-2 -mx-2 rounded hover:bg-muted transition-colors"
        >
          <span className="h-3 w-3 rounded shrink-0" style={{ background: p.color || 'rgb(var(--c-mint))' }} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{p.name}</div>
            <div className="text-[11px] font-mono text-subtle truncate">{p.slug}</div>
          </div>
        </a>
      ))}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-9 rounded bg-muted animate-pulse" />
      ))}
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-subtle">
      <Icon className="h-8 w-8 mb-2 opacity-50" />
      <div className="text-sm font-mono">{text}</div>
    </div>
  );
}
