'use client';
// Old API Docs page — folded into Endpoints. Each rule's detail card has an
// OpenAPI sub-tab, so this is a redirect-only stub kept to avoid 404s on
// bookmarked URLs.
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function ApiDocsRedirect() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/projects/${projectId}/integrations/endpoints`);
  }, [projectId, router]);
  return null;
}
