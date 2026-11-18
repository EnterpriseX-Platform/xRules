import { redirect } from 'next/navigation';
// /projects/{id}/integrations (breadcrumb target) opens API Keys.
export default function IntegrationsHome({ params }: { params: { projectId: string } }) {
  redirect(`/p/${params.projectId}/integrations/api-keys`);
}
