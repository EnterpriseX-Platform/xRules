'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/lib/store';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuth((s) => s.token);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = localStorage.getItem('xrules_token');
    if (!t && !token) {
      router.replace('/login');
    }
  }, [token, router]);

  return <AppShell>{children}</AppShell>;
}
