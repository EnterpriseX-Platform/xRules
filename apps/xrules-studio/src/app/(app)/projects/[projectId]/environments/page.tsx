'use client';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { GitBranch, Plus } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { Pill } from '@/components/ui/Pill';
import { environmentsApi, releasesApi } from '@/lib/api';

export default function EnvironmentsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const { data: envs = [], isLoading } = useQuery({
    queryKey: ['environments', projectId],
    queryFn: () => environmentsApi.list(projectId),
  });
  const { data: releases = [] } = useQuery({
    queryKey: ['releases', projectId],
    queryFn: () => releasesApi.list(projectId),
  });

  return (
    <PageContent>
      <PageHeader
        title="Environments"
        description="Pin a Release to dev / staging / prod — execute API resolves version per env"
        stats={[{ label: 'Envs', value: envs.length }]}
        actions={
          <button className="btn-primary" onClick={async () => {
            const name = prompt('Environment name (e.g. prod)');
            if (!name) return;
            await environmentsApi.create({ projectId, name });
            qc.invalidateQueries({ queryKey: ['environments', projectId] });
          }}>
            <Plus className="h-3.5 w-3.5" />
            New Environment
          </button>
        }
      />
      {isLoading ? <div className="card p-8 text-center text-subtle font-mono text-sm">Loading…</div> :
       envs.length === 0 ? (
         <div className="card p-12 text-center">
           <GitBranch className="h-10 w-10 mx-auto text-subtle/40 mb-2" />
           <div className="text-sm text-subtle">No environments — create dev/staging/prod</div>
         </div>
       ) : (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
           {envs.map((e: any) => (
             <div key={e.id} className="card p-4">
               <div className="flex items-center justify-between mb-3">
                 <div>
                   <div className="font-mono text-xs uppercase tracking-label text-subtle">{e.slug}</div>
                   <div className="text-lg font-bold">{e.name}</div>
                 </div>
                 <GitBranch className="h-5 w-5 text-subtle" />
               </div>
               <div className="text-xs space-y-1.5">
                 <div className="flex items-center justify-between">
                   <span className="text-subtle">Pinned release</span>
                   {e.release ? <Pill tone="ok">{e.release.name}</Pill> : <Pill tone="subtle">none</Pill>}
                 </div>
                 <select
                   className="input w-full mt-2 text-xs"
                   value={e.releaseId || ''}
                   onChange={async (ev) => {
                     await environmentsApi.pin(e.id, ev.target.value);
                     qc.invalidateQueries({ queryKey: ['environments', projectId] });
                   }}
                 >
                   <option value="">— select release —</option>
                   {releases.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                 </select>
               </div>
             </div>
           ))}
         </div>
       )}
    </PageContent>
  );
}
