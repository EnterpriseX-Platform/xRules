'use client';
// Audit log viewer — backed by /bi/audit/v2 endpoint (cursor pagination + filters).
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ListTree, Search } from 'lucide-react';
import { useAuth } from '@/lib/store';
import { api } from '@/lib/api';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { EntityTable, StatusPill, Pill } from '@/components/EntityList';

export default function AuditPage() {
  const ws = useAuth(s => s.workspace);
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const { data, isLoading } = useQuery({
    queryKey: ['audit', ws?.id, cursor],
    queryFn: () => api.get<any[]>(`/bi/audit/v2?workspaceId=${ws?.id}${cursor ? `&after=${cursor}` : ''}&page_size=50`),
    enabled: !!ws?.id,
  });

  // Backend wraps as { success, data, nextCursor }; api.ts unwraps once → we
  // get the array directly. Fall back to .data for older shape.
  const rawRows: any[] = Array.isArray(data) ? data : ((data as any)?.data || []);
  const nextCursor: string | undefined = Array.isArray(data) ? undefined : (data as any)?.nextCursor;
  const rows: any[] = rawRows.filter((r: any) =>
    !search ||
    (r.rule?.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.id || '').includes(search),
  );

  return (
    <PageContent>
      <PageHeader
        title="Audit Log"
        description="Every rule execution recorded with input, output, duration, correlation ID, and API key."
        stats={[{ label: 'Rows', value: rows.length }]}
      />

      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-subtle" />
          <input className="input w-full pl-9" placeholder="search rule name or id…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {nextCursor && <button className="btn-outline text-xs" onClick={() => setCursor(nextCursor)}>Load older</button>}
      </div>

      <EntityTable
        rows={rows}
        isLoading={isLoading}
        emptyText="No audit entries"
        emptyIcon={ListTree}
        columns={[
          { header: 'Rule', cell: (r: any) => (
            <div>
              <div className="text-sm font-medium">{r.rule?.name || r.ruleId}</div>
              <div className="font-mono text-[11px] text-subtle">{r.rule?.alias || r.rule?.slug} · v{r.ruleVersion}</div>
            </div>
          ) },
          { header: 'Status', cell: (r: any) => <StatusPill status={r.status} /> },
          { header: 'Duration', cell: (r: any) => <span className="font-mono text-xs text-subtle tabular-nums">{r.duration ?? '—'}ms</span>, align: 'right' },
          { header: 'API Key', cell: (r: any) => <span className="font-mono text-[11px] text-subtle">{r.apiKeyId ? r.apiKeyId.slice(0, 8) + '…' : '—'}</span> },
          { header: 'When', cell: (r: any) => <span className="font-mono text-xs text-subtle">{new Date(r.createdAt).toLocaleString()}</span>, align: 'right' },
        ]}
      />
    </PageContent>
  );
}
