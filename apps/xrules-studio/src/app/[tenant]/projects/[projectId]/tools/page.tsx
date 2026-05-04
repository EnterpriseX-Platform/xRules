'use client';
// Tools — maintenance utilities: duplicate-row detector + per-rule dependency inspector.
// Wraps backend /tools/duplicates/:id and /tools/dependencies/:id.
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Wrench, Search, AlertTriangle, ChevronRight, Workflow } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { rulesApi, api } from '@/lib/api';
import { Pill } from '@/components/ui/Pill';

export default function ToolsPage() {
  const { tenant, projectId } = useParams<{ tenant: string; projectId: string }>();
  const [tab, setTab] = useState<'duplicates' | 'dependencies'>('duplicates');
  const [search, setSearch] = useState('');

  const { data: rules = [] } = useQuery({
    queryKey: ['rules', projectId],
    queryFn: () => rulesApi.list(projectId),
  });

  const filtered = rules.filter((r: any) =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.slug.includes(search.toLowerCase()),
  );
  const tableRules = filtered.filter((r: any) => r.type === 'DECISION_TABLE');

  return (
    <PageContent>
      <PageHeader
        title="Tools"
        description="Maintenance utilities — find duplicate rows, inspect rule dependencies"
        stats={[
          { label: 'Rules',  value: rules.length },
          { label: 'Tables', value: tableRules.length },
        ]}
      />

      <div className="flex items-center gap-3 mb-3">
        <div className="tabs-row">
          <button className={`tab ${tab === 'duplicates' ? 'tab-active' : ''}`} onClick={() => setTab('duplicates')}>
            <AlertTriangle className="h-3 w-3 inline mr-1.5" />
            Duplicate Rows
          </button>
          <button className={`tab ${tab === 'dependencies' ? 'tab-active' : ''}`} onClick={() => setTab('dependencies')}>
            <Workflow className="h-3 w-3 inline mr-1.5" />
            Dependencies
          </button>
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-subtle" />
          <input
            className="input w-full pl-9"
            placeholder="filter by name or slug…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {tab === 'duplicates' && (
        <div className="space-y-2">
          {tableRules.length === 0 && (
            <div className="card p-12 text-center text-subtle text-sm">
              No Decision Tables — duplicate detection only applies to tables.
            </div>
          )}
          {tableRules.map((r: any) => (
            <DuplicatesCard key={r.id} rule={r} tenant={tenant} projectId={projectId} />
          ))}
        </div>
      )}

      {tab === 'dependencies' && (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="card p-12 text-center text-subtle text-sm">
              No rules match the filter.
            </div>
          )}
          {filtered.map((r: any) => (
            <DependenciesCard key={r.id} rule={r} tenant={tenant} projectId={projectId} />
          ))}
        </div>
      )}
    </PageContent>
  );
}

function DuplicatesCard({ rule, tenant, projectId }: { rule: any; tenant: string; projectId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['duplicates', rule.id],
    queryFn: () => api.get<any>(`/tools/duplicates/${rule.id}`),
  });

  const dupGroups = data?.duplicateGroups || [];
  const totalDups = dupGroups.reduce((s: number, g: any) => s + g.rowIndices.length, 0);

  return (
    <Link href={`/${tenant}/projects/${projectId}/rules/${rule.id}`} className="block">
      <div className="card p-3 hover:border-accent/40 transition-colors flex items-center gap-3">
        <div className="flex-1">
          <div className="text-sm font-medium">{rule.name}</div>
          <div className="font-mono text-[10px] text-subtle">{rule.slug}</div>
        </div>
        {isLoading && <span className="text-[10px] font-mono text-subtle">scanning…</span>}
        {!isLoading && (
          <>
            <span className="text-xs text-subtle font-mono tabular-nums">
              {data?.totalRows || 0} rows
            </span>
            {dupGroups.length > 0 ? (
              <Pill tone="danger">
                {dupGroups.length} groups · {totalDups} dup
              </Pill>
            ) : (
              <Pill tone="ok">clean</Pill>
            )}
          </>
        )}
        <ChevronRight className="h-4 w-4 text-subtle" />
      </div>
    </Link>
  );
}

function DependenciesCard({ rule, tenant, projectId }: { rule: any; tenant: string; projectId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['deps', rule.id],
    queryFn: () => api.get<any>(`/tools/dependencies/${rule.id}`),
  });

  const upCount = data?.upstream?.length || 0;
  const downCount = data?.downstream?.length || 0;
  const flowCount = data?.flows?.length || 0;
  const isolated = !isLoading && upCount === 0 && downCount === 0 && flowCount === 0;

  return (
    <Link href={`/${tenant}/projects/${projectId}/rules/${rule.id}`} className="block">
      <div className="card p-3 hover:border-accent/40 transition-colors flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{rule.name}</div>
          <div className="font-mono text-[10px] text-subtle truncate">{rule.slug} · {rule.type.toLowerCase().replace('_', ' ')}</div>
        </div>
        {isLoading && <span className="text-[10px] font-mono text-subtle">scanning…</span>}
        {!isLoading && (
          <div className="flex items-center gap-1.5">
            {upCount > 0 && <Pill tone="info">{upCount} ↑</Pill>}
            {downCount > 0 && <Pill tone="mint">{downCount} ↓</Pill>}
            {flowCount > 0 && <Pill tone="warn">{flowCount} flow</Pill>}
            {isolated && <Pill tone="subtle">isolated</Pill>}
          </div>
        )}
        <ChevronRight className="h-4 w-4 text-subtle" />
      </div>
    </Link>
  );
}
