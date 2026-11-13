'use client';
// Tenant switcher in the top bar. Switching clears every cached query and returns to Projects,
// because all data below the tenant (projects, keys, runs) belongs to the tenant.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { ChevronDown, Check, Plus, Settings } from 'lucide-react';
import { tenantApi } from '@/lib/api';
import { useAuth, useProject } from '@/lib/store';

export function TenantSwitcher() {
  const router = useRouter();
  const qc = useQueryClient();
  const ws = useAuth(s => s.workspace);
  const setWorkspace = useAuth(s => s.setWorkspace);
  const setProject = useProject(s => s.setCurrentProject);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: tenants = [] } = useQuery({ queryKey: ['tenants'], queryFn: tenantApi.list, staleTime: 60_000 });

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as any)) { setOpen(false); setCreating(false); } };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  // stored tenant gone (removed from it) or never set → fall back to the first membership
  useEffect(() => {
    if (!tenants.length) return;
    if (!ws?.slug || !tenants.some((t: any) => t.slug === ws.slug)) switchTo(tenants[0], false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenants, ws?.slug]);

  function switchTo(t: any, navigate = true) {
    setWorkspace({ id: t.id, slug: t.slug, name: t.name });
    setProject(null);
    setOpen(false); setCreating(false);
    qc.removeQueries({ predicate: q => q.queryKey[0] !== 'tenants' });
    if (navigate) router.push('/projects');
  }

  const current = tenants.find((t: any) => t.slug === ws?.slug);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}
        className="h-8 flex items-center gap-2 px-2.5 text-[13px] text-white hover:bg-[#393939] max-w-[220px]">
        <span className="text-[#8d8d8d]">Tenant</span>
        <span className="font-medium truncate">{current?.name ?? ws?.name ?? '—'}</span>
        <ChevronDown className="h-3.5 w-3.5 text-[#c6c6c6] shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-50 w-72 bg-[#262626] text-[#f4f4f4] shadow-xl border border-[#393939]" role="listbox">
          <div className="px-3 pt-2.5 pb-1 text-[12px] text-[#a8a8a8]">Your tenants</div>
          {tenants.map((t: any) => (
            <button key={t.id} type="button" role="option" aria-selected={t.slug === ws?.slug} onClick={() => switchTo(t)}
              className="w-full flex items-center gap-2 px-3 h-11 text-left hover:bg-[#393939]">
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] truncate">{t.name}</span>
                <span className="block text-[12px] text-[#a8a8a8] font-mono truncate">{t.slug} · {String(t.role).toLowerCase()} · {t.projectCount} project{t.projectCount === 1 ? '' : 's'}</span>
              </span>
              {t.slug === ws?.slug && <Check className="h-4 w-4 text-[#78a9ff] shrink-0" />}
            </button>
          ))}
          <div className="border-t border-[#393939]">
            {creating ? <CreateTenant onDone={t => { qc.invalidateQueries({ queryKey: ['tenants'] }); switchTo(t); }} />
              : <button type="button" onClick={() => setCreating(true)} className="w-full flex items-center gap-2 px-3 h-10 text-[14px] hover:bg-[#393939]"><Plus className="h-4 w-4" />New tenant</button>}
            <button type="button" onClick={() => { setOpen(false); router.push('/settings/tenant'); }} className="w-full flex items-center gap-2 px-3 h-10 text-[14px] hover:bg-[#393939]"><Settings className="h-4 w-4" />Tenant settings</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateTenant({ onDone }: { onDone: (t: any) => void }) {
  const [name, setName] = useState('');
  const m = useMutation({ mutationFn: () => tenantApi.create({ name: name.trim() }), onSuccess: onDone });
  return (
    <form className="p-3 space-y-2" onSubmit={e => { e.preventDefault(); if (name.trim()) m.mutate(); }}>
      <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Tenant name"
        className="w-full h-9 px-3 bg-[#393939] text-[14px] text-white placeholder:text-[#8d8d8d] outline-none border-b border-[#6f6f6f] focus:border-[#78a9ff]" />
      {m.error && <div className="text-[12px] text-[#ff8389]">{(m.error as any).message}</div>}
      <button type="submit" disabled={!name.trim() || m.isPending} className="w-full h-9 bg-[#0f62fe] text-white text-[14px] disabled:opacity-50">Create tenant</button>
    </form>
  );
}
