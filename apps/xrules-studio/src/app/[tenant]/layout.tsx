'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/lib/store';

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams<{ tenant: string }>();
  const token = useAuth((s) => s.token);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = localStorage.getItem('xrules_token');
    if (!t && !token) {
      router.replace('/login');
    }
  }, [token, router]);

  return <AppShell tenant={params.tenant}>{children}</AppShell>;
}
