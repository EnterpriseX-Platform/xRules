'use client';
// Organization settings sections — one tab row shared by the pages that make up org settings.
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const TABS = [
  { key: 'General',  href: '/settings/tenant' },
  { key: 'Members',  href: '/settings/tenant?tab=Members' },
  { key: 'Roles',    href: '/settings/tenant?tab=Roles' },
  { key: 'API Keys', href: '/projects/_integration/integrations/api-keys' },
  { key: 'Webhooks', href: '/projects/_integration/integrations/webhooks' },
  { key: 'Audit',    href: '/projects/_all/audit' },
];

function Inner({ title }: { title?: string }) {
  const path = usePathname() || '';
  const tab = useSearchParams()?.get('tab') || '';
  const active = path.startsWith('/settings/tenant') ? (tab === 'Members' || tab === 'Roles' ? tab : 'General')
    : path.includes('/api-keys') ? 'API Keys' : path.includes('/webhooks') ? 'Webhooks' : path.includes('/audit') ? 'Audit' : '';
  return (
    <div className="mb-5">
      <h1 className="text-[24px] leading-8 text-[#161616] mb-3">{title || 'Organization'}</h1>
      <div className="flex border-b border-[#e0e0e0] overflow-x-auto">
        {TABS.map(t => (
          <Link key={t.key} href={t.href}
            className={`h-10 px-4 flex items-center text-[14px] whitespace-nowrap border-b-2 -mb-px ${active === t.key ? 'border-[#161616] text-[#161616] font-semibold' : 'border-transparent text-[#525252] hover:text-[#161616]'}`}>
            {t.key}
          </Link>
        ))}
      </div>
    </div>
  );
}
export function OrgTabs(props: { title?: string }) {
  return <Suspense><Inner {...props} /></Suspense>;
}
