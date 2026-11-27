'use client';
// The plain header line every editor shows: what you edit is a draft; what runs is the live version.
// Nothing reaches production until tests → approval → release → promote.
import { useQuery } from '@tanstack/react-query';
import { api, rulesApi } from '@/lib/api';
import { useEnvironment } from '@/lib/perms';

export function DraftLine({ ruleId, status, version }: { ruleId?: string; status?: string; version?: number }) {
  const env = useEnvironment();
  const { data: versions = [] } = useQuery({ queryKey: ['rule-versions', ruleId], queryFn: () => rulesApi.versions(ruleId!), enabled: !!ruleId, staleTime: 30_000 });
  const live = (versions as any[]).filter(v => String(v.status).toUpperCase() === 'PUBLISHED').map(v => Number(v.version)).sort((a, b) => b - a)[0];
  const st = String(status || '').toLowerCase();
  if (env.production) return <span>Read-only in production{live ? ` · live is v${live}` : ''}</span>;
  if (st === 'published' && live === version) return <span>Live v{version}</span>;
  return <span>Draft{live ? ` · live is v${live}` : ' · not live yet'}</span>;
}

/** For screens over many objects (a topic, the library, settings): the draft here and the release live in this environment. */
export function EnvLine({ projectId }: { projectId: string }) {
  const env = useEnvironment();
  const { data: envs = [] } = useQuery({ queryKey: ['environments', projectId], queryFn: () => api.get<any[]>(`/environments?project_id=${projectId}`), enabled: !!projectId, staleTime: 30_000 });
  const here = (envs as any[]).find(e => String(e.slug).toUpperCase() === env.name || (env.production && /^prod/i.test(e.slug)));
  const live = here?.release?.name;
  if (env.production) return <span>Read-only in production{live ? ` · live is ${live}` : ''}</span>;
  return <span>Draft{live ? ` · live is ${live}` : ' · not released yet'}</span>;
}
