'use client';

import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell({ tenant, children }: { tenant: string; children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar tenant={tenant} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-bg bg-dot-pattern bg-dot relative">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title, description, actions, stats,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  stats?: { label: string; value: string | number }[];
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="flex-1">
        <h1 className="h1-page">{title}</h1>
        {description && <p className="text-subtle text-sm mt-1">{description}</p>}
        {stats && stats.length > 0 && (
          <div className="flex items-center gap-4 mt-3 font-mono text-xs">
            {stats.map((s, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-subtle/50">▸</span>
                <span className="text-text tabular-nums">{String(s.value).padStart(2, '0')}</span>
                <span className="uppercase tracking-label text-subtle">{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageContent({ children }: { children: React.ReactNode }) {
  return <div className="px-8 py-6 max-w-[1600px]">{children}</div>;
}
