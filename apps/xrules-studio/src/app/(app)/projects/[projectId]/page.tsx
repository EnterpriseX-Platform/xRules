import { redirect } from 'next/navigation';
// /projects/{id} (breadcrumb target) opens the project's Rules.
export default function ProjectHome({ params }: { params: { projectId: string } }) {
  redirect(`/projects/${params.projectId}/rules`);
}
