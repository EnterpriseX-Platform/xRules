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
    <div className="flex items-start justify-between gap-6 mb-8">
      <div className="flex-1 min-w-0">
        <h1 className="h1-page">{title}</h1>
        {description && <p className="text-subtle text-[14px] mt-1.5 leading-relaxed">{description}</p>}
        {stats && stats.length > 0 && (
          <div className="flex items-center gap-8 mt-5">
            {stats.map((s, i) => (
              <div key={i} className="flex items-baseline gap-2">
                <span className="text-[20px] font-semibold text-text tabular-nums leading-none">{s.value}</span>
                <span className="text-[12px] text-subtle/80">{s.label.toLowerCase()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

export function PageContent({ children }: { children: React.ReactNode }) {
  return <div className="px-10 py-8 max-w-[1600px]">{children}</div>;
}
