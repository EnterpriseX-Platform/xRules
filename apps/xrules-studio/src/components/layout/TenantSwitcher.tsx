'use client';
// One account belongs to one organization: the top bar shows its name, no switcher.
import { useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { tenantApi } from '@/lib/api';
import { useAuth } from '@/lib/store';

export function TenantSwitcher() {
  const ws = useAuth(s => s.workspace);
  const setWorkspace = useAuth(s => s.setWorkspace);
  const { data: tenants = [] } = useQuery({ queryKey: ['tenants'], queryFn: tenantApi.list, staleTime: 60_000 });
  useEffect(() => {
    if (!tenants.length) return;
    const t = tenants[0] as any;
    if (ws?.slug !== t.slug || ws?.name !== t.name) setWorkspace({ id: t.id, slug: t.slug, name: t.name });
  }, [tenants, ws?.slug, ws?.name, setWorkspace]);
  const name = (tenants[0] as any)?.name || ws?.name;
  if (!name) return null;
  return (
    <Link href="/projects" className="h-8 px-2 flex items-center text-[14px] text-white hover:bg-[#393939] max-w-[220px]">
      <span className="truncate">{name}</span>
    </Link>
  );
}
