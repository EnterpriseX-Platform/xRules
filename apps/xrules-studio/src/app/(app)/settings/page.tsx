'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { KeyRound, Webhook, Users, Settings as SettingsIcon } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';

export default function SettingsPage() {
  // tenant prefix removed from URLs
  const cards = [
    { href: `/settings/api-keys`,  icon: KeyRound, title: 'API Keys',  desc: 'Create, scope, and revoke keys for the public Execute API' },
    { href: `/settings/webhooks`,  icon: Webhook,  title: 'Webhooks',  desc: 'Subscribe to execute.success / execute.error events' },
    { href: `/settings/tenant`,    icon: Users,    title: 'Tenant',    desc: 'Tenant details, members and roles' },
  ];
  return (
    <PageContent>
      <PageHeader title="Settings" description="Tenant configuration" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.href} href={c.href} className="card p-5 hover:border-accent/50 transition-colors group">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded bg-accent/10 text-accent flex items-center justify-center">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-medium group-hover:text-accent">{c.title}</div>
                  <div className="text-sm text-subtle mt-0.5">{c.desc}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </PageContent>
  );
}
