'use client';

import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-bg relative">
          {children}
        </main>
      </div>
      <CommandPalette />
      <AssistantPanel />
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
      <div className="flex-1 min-w-0">
        <h1 className="h1-page">{title}</h1>
        {description && <p className="text-subtle text-sm mt-1">{description}</p>}
        {stats && stats.length > 0 && (
          <div className="flex items-center gap-6 mt-4">
            {stats.map((s, i) => (
              <div key={i} className="flex items-baseline gap-1.5">
                <span className="text-base font-semibold text-text tabular-nums">{s.value}</span>
                <span className="text-xs text-subtle">{s.label.toLowerCase()}</span>
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
