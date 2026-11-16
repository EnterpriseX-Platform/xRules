'use client';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useTheme } from '@/lib/store';

type Failure = { id: number; message: string };

export function Providers({ children }: { children: React.ReactNode }) {
  const [failures, setFailures] = useState<Failure[]>([]);
  // Any save that fails and isn't handled by its own screen is shown — never lost silently.
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
    mutationCache: new MutationCache({
      onError: (err: any, _v, _c, mutation) => {
        if (mutation.options.onError || mutation.meta?.silent) return;
        const lead = (mutation.meta?.failLabel as string) || 'Not saved';
        const id = Date.now() + Math.random();
        const message = err?.status === 403 && !err?.code ? `${lead} — the request was blocked (403).` : `${lead} — ${err?.message || 'request failed'}`;
        setFailures(f => [...f.slice(-2), { id, message }]);
        setTimeout(() => setFailures(f => f.filter(x => x.id !== id)), 10_000);
      },
    }),
  }));
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);

  // Sync theme on first client render
  useEffect(() => {
    setTheme(theme);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <QueryClientProvider client={client}>
      {children}
      {failures.length > 0 && (
        <div className="fixed right-4 bottom-20 z-[1100] w-[360px] space-y-2" role="status" aria-live="polite">
          {failures.map(f => (
            <div key={f.id} role="alert" className="flex items-start gap-3 bg-[#fff1f1] border-l-[3px] border-[#da1e28] px-4 py-3 text-[14px] text-[#161616] shadow-[0_2px_6px_rgba(0,0,0,.2)]">
              <span className="flex-1">{f.message}</span>
              <button aria-label="Dismiss" onClick={() => setFailures(x => x.filter(y => y.id !== f.id))} className="h-5 w-5 flex items-center justify-center"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </QueryClientProvider>
  );
}
