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
          { label: 'Models',      value: stats.models },
          { label: 'Executions',  value: stats.executions },
        ]}
      />


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[15px] font-semibold tracking-tight">Recent executions</h2>
            <span className="text-[11px] text-subtle tabular-nums">{Number(stats.executions).toLocaleString()} total</span>
          </div>
          <RecentTable rows={data?.recentExecutions || []} loading={isLoading} />
        </div>

        <div className="card p-5">
          <h2 className="text-[15px] font-semibold tracking-tight mb-5">Recent projects</h2>
          <ProjectList rows={data?.recentProjects || []} loading={isLoading} />
        </div>
      </div>
    </PageContent>
  );
}

function KpiCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: 'info' | 'mint' | 'warn' | 'accent' }) {
  const toneCls = {
    info:   'text-info bg-info/10',
    mint:   'text-mint bg-mint/10',
    warn:   'text-warn bg-warn/10',
    accent: 'text-accent bg-accent/10',
  }[tone];
  return (
    <div className="card p-5 flex items-center gap-4 card-hover">
      <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${toneCls}`}>
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </div>
      <div>
        <div className="kpi-num">{value}</div>
        <div className="text-[12px] text-subtle mt-1">{label}</div>
      </div>
    </div>
  );
}

function RecentTable({ rows, loading }: { rows: any[]; loading: boolean }) {
  if (loading) return <SkeletonRows />;
  if (!rows.length) return <Empty icon={Activity} text="No recent executions" />;
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-border/60">
        <tr className="text-left">
          <th className="py-2 pr-4 label-section">#</th>
          <th className="py-2 pr-4 label-section">Rule</th>
          <th className="py-2 pr-4 label-section">Status</th>
          <th className="py-2 pr-4 label-section text-right">Duration</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 5).map((r, i) => (
          <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
            <td className="py-3 pr-4 row-index">{String(i + 1).padStart(2, '0')}</td>
            <td className="py-3 pr-4 truncate max-w-[260px] font-medium">{r.ruleName || r.rule?.name || r.flow?.name || '—'}</td>
            <td className="py-3 pr-4">
              <span className={`pill ${String(r.status).toUpperCase() === 'SUCCESS' ? 'pill-ok' : String(r.status).toUpperCase() === 'FAILED' ? 'pill-danger' : 'pill-warn'}`}>
                <span className={`dot ${String(r.status).toUpperCase() === 'SUCCESS' ? 'bg-ok' : String(r.status).toUpperCase() === 'FAILED' ? 'bg-danger' : 'bg-warn'}`} />
                {r.status.toLowerCase()}
              </span>
            </td>
            <td className="py-3 pr-4 text-right text-xs text-subtle tabular-nums">
              {r.duration ? `${r.duration} ms` : '—'}
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
    <div className="space-y-1">
      {rows.slice(0, 6).map((p) => (
        <a
          key={p.id}
          href={`/projects/${p.slug || p.id}/rules`}
          className="flex items-center gap-3 p-2.5 -mx-2 rounded-lg hover:bg-muted/60 transition-colors group"
        >
          <span className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-offset-2 ring-offset-surface" style={{ background: p.color || 'rgb(var(--c-mint))' }} />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium truncate group-hover:text-accent transition-colors">{p.name}</div>
            <div className="text-[11.5px] text-subtle truncate">{p.slug}</div>
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
        <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
      ))}
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-subtle">
      <div className="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
        <Icon className="h-5 w-5 text-subtle/70" />
      </div>
      <div className="text-sm">{text}</div>
    </div>
  );
}
