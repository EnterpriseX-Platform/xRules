'use client';
// Project picker in the Carbon header, next to the tenant switcher (same look: header button + g100 menu).
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Checkmark } from '@carbon/icons-react';

export function ProjectPicker({ projects, current, onPick }: { projects: any[]; current: any; onPick: (p: any) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="relative h-full" ref={ref}>
      <button type="button" className="xr-header-select" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="xr-header-select-label">Project</span>
        <span className="truncate">{current?.name || '—'}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="xr-header-menu" role="listbox">
          {projects.map(p => (
            <button key={p.id} type="button" role="option" aria-selected={p.id === current?.id}
              onClick={() => { onPick(p); setOpen(false); router.push(`/projects/${p.slug || p.id}/rules`); }}>
              <span className="flex-1 truncate">{p.name}</span>
              {p.id === current?.id && <Checkmark size={16} />}
            </button>
          ))}
          <NextLink href="/projects" className="xr-header-menu-foot" onClick={() => setOpen(false)}>Manage projects</NextLink>
        </div>
      )}
    </div>
  );
}
