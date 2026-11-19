'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PipelineEditor } from '@/components/pipeline/PipelineEditor';

export default function FlowEditorPage() {
  const { projectId, flowId } = useParams<{ projectId: string; flowId: string }>();
  const router = useRouter();
  // an old /flows/{id} link to an API operation's steps: move to /apis/{api}/ops/{operation}
  const hub = projectId.startsWith('_');
  const { data: specs } = useQuery({ queryKey: ['specs', projectId], queryFn: () => api.get<any[]>(`/platform/specs?project_id=${projectId}`), enabled: hub });
  const owner = (specs || []).flatMap((s: any) => (s.operations || []).map((o: any) => ({ s, o }))).find(x => x.o.flowId === flowId);
  useEffect(() => { if (owner) router.replace(`/apis/${owner.s.id}/ops/${owner.o.id}`); }, [owner, router]);
  if (hub && (!specs || owner)) return null;
  return <PipelineEditor projectId={projectId} flowId={flowId} backHref={hub ? '/triggers' : `/p/${projectId}/flows`} backLabel={hub ? 'Triggers' : 'Flows'} />;
}
