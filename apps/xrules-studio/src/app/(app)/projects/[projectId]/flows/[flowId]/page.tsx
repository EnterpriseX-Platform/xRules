'use client';
import { useParams } from 'next/navigation';
import { PipelineEditor } from '@/components/pipeline/PipelineEditor';

export default function FlowEditorPage() {
  const { projectId, flowId } = useParams<{ projectId: string; flowId: string }>();
  return <PipelineEditor projectId={projectId} flowId={flowId} backHref={`/projects/${projectId}/flows`} backLabel="Flows" />;
}
