'use client';
import { Webhook } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';

export default function WebhooksPage() {
  return (
    <PageContent>
      <PageHeader
        title="Webhooks"
        description="HMAC-signed callbacks on rule execution events"
      />
      <div className="card p-12 text-center">
        <Webhook className="h-12 w-12 mx-auto text-subtle/40 mb-3" />
        <div className="text-sm text-subtle">Webhooks coming soon</div>
        <div className="text-xs text-subtle/60 font-mono mt-2">execute.success · execute.error · rule.published</div>
      </div>
    </PageContent>
  );
}
