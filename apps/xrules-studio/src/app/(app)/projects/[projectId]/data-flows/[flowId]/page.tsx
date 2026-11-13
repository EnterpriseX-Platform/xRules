'use client';
import { useParams } from 'next/navigation';
import { PipelineEditor } from '@/components/pipeline/PipelineEditor';

export default function DataFlowEditorPage() {
  const { projectId, flowId } = useParams<{ projectId: string; flowId: string }>();
  return <PipelineEditor projectId={projectId} flowId={flowId} backHref={`/projects/${projectId}/data-flows`} backLabel="Data Flows" />;
}
