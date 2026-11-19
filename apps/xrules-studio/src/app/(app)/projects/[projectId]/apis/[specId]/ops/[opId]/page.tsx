'use client';
// The steps of one API operation: /apis/{api}/ops/{operation}
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PipelineEditor } from '@/components/pipeline/PipelineEditor';

export default function OperationFlowPage() {
  const { projectId, specId, opId } = useParams<{ projectId: string; specId: string; opId: string }>();
  const { data: spec } = useQuery({ queryKey: ['spec', specId], queryFn: () => api.get<any>(`/platform/specs/${specId}`) });
  const op = (spec?.operations || []).find((o: any) => o.id === opId);
  if (!op?.flowId) return null;
  return <PipelineEditor projectId={projectId} flowId={op.flowId} backHref={`/apis/${specId}`} backLabel={spec?.name || 'API'} />;
}
