'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTheme } from '@/lib/store';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
  }));
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);

  // Sync theme on first client render
  useEffect(() => {
    setTheme(theme);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
