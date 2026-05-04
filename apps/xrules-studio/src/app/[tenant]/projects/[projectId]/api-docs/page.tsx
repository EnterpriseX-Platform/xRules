'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { Pill, StatusPill } from '@/components/ui/Pill';
import { rulesApi } from '@/lib/api';

export default function ApiDocsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: rules = [] } = useQuery({
    queryKey: ['rules', projectId, 'all'],
    queryFn: () => rulesApi.list(projectId),
  });

  const { data: spec } = useQuery({
    queryKey: ['openapi', selectedId],
    queryFn: () => selectedId ? rulesApi.openapi(selectedId) : null,
    enabled: !!selectedId,
  });

  return (
    <PageContent>
      <PageHeader
        title="API Docs"
        description="Auto-generated OpenAPI 3.1 specs per rule — copy curl, get SDK code"
        stats={[{ label: 'Rules', value: rules.length }]}
      />

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1 card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border label-section">Rules</div>
          <div className="max-h-[600px] overflow-y-auto">
            {rules.length === 0 && (
              <div className="p-6 text-center text-subtle text-sm">
                <BookOpen className="h-8 w-8 mx-auto opacity-40 mb-2" />
                No rules yet
              </div>
            )}
            {rules.map((r: any) => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/50 transition-colors ${selectedId === r.id ? 'bg-muted' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  <StatusPill status={r.status} />
                </div>
                <div className="text-xs text-subtle font-mono truncate mt-0.5">{r.slug}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-2 card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border label-section">OpenAPI 3.1 Spec</div>
          {!selectedId ? (
            <div className="p-12 text-center text-subtle text-sm">Select a rule to view its API spec</div>
          ) : (
            <pre className="p-4 overflow-auto max-h-[600px] text-xs font-mono text-text">
              {spec ? JSON.stringify(spec, null, 2) : 'Loading…'}
            </pre>
          )}
        </div>
      </div>
    </PageContent>
  );
}
