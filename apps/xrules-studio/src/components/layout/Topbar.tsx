'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Search, Plus, Sun, Moon, Bell, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTheme, useAuth } from '@/lib/store';

export function Topbar() {
  const pathname = usePathname();
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  const user = useAuth((s) => s.user);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const crumbs = pathname.split('/').filter(Boolean);
  const last = crumbs[crumbs.length - 1] || 'home';

  return (
    <header className="h-[60px] shrink-0 border-b border-border bg-bg flex items-center px-4 gap-4">
      {/* Breadcrumb (shell-style) */}
      <div className="flex items-center gap-1.5 font-mono text-xs text-subtle">
        <span className="text-accent">{'>'}</span>
        <span className="text-subtle">~</span>
        {crumbs.length > 0 && (
          <span className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-subtle/50" />
            <span className="uppercase tracking-label text-text">{last}</span>
          </span>
        )}
      </div>

      {/* Live status pills (centered/spacer) */}
      <div className="hidden md:flex items-center gap-2 ml-4">
        <span className="live-pill">
          <span className="dot bg-ok" />
          <span>SOLVER</span>
          <span className="text-text tabular-nums" suppressHydrationWarning>{nowUtc()}</span>
          <span className="text-subtle/60">UTC</span>
        </span>
        <span className="live-pill">
          <span>v0.2.0</span>
        </span>
        <span className="live-pill">
          <span className="text-subtle/60">t=</span>
          <span className="text-text tabular-nums">{String(tick).padStart(4, '0')}</span>
        </span>
      </div>

      {/* Search */}
      <div className="ml-auto relative w-80 max-w-full hidden lg:block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-subtle" />
        <input
          className="input w-full pl-9 pr-12"
          placeholder="search…"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-subtle bg-surface border border-border rounded px-1.5 py-0.5">
          ⌘K
        </span>
      </div>

      <button className="btn-primary">
        <Plus className="h-3.5 w-3.5" />
        New Rule
      </button>

      <button className="btn-ghost" onClick={toggle} aria-label="Toggle theme">
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <button className="btn-ghost relative" aria-label="Notifications">
        <Bell className="h-4 w-4" />
        <span className="absolute top-1.5 right-1.5 dot bg-danger" />
      </button>

      <div className="h-7 w-7 rounded bg-accent/10 text-accent flex items-center justify-center text-sm font-mono">
        {user?.email?.[0]?.toUpperCase() || 'A'}
      </div>
    </header>
  );
}

function nowUtc() {
  const d = new Date();
  return [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}
