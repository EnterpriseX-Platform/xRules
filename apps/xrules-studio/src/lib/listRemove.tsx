'use client';
// One way to remove a row from a list, used by every list in the studio:
//  - the row leaves the list at once (the cached list is updated locally), so nothing moves under the pointer later;
//  - while the call is in flight the row's buttons are disabled and a second click is ignored;
//  - with a restore (soft-deleted rows) a toast offers Undo; without one, the app's own dialog asks first, naming the item.
import { useRef, useState } from 'react';
import { create } from 'zustand';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Modal } from '@/components/pipeline/ui';

type Toast = { id: number; message: string; error?: boolean; undo?: () => Promise<unknown> };
const useToasts = create<{ list: Toast[]; push: (t: Omit<Toast, 'id'>) => void; drop: (id: number) => void }>(set => ({
  list: [],
  push: t => {
    const id = Date.now() + Math.random();
    set(s => ({ list: [...s.list.slice(-2), { ...t, id }] }));
    setTimeout(() => set(s => ({ list: s.list.filter(x => x.id !== id) })), 10_000);
  },
  drop: id => set(s => ({ list: s.list.filter(x => x.id !== id) })),
}));

/** Rendered once (Providers): "Removed reason code M021 · Undo". */
export function RemoveToasts() {
  const { list, drop, push } = useToasts();
  const [undoing, setUndoing] = useState<number | null>(null);
  if (!list.length) return null;
  return (
    <div className="fixed left-4 bottom-4 z-[1100] w-[380px] space-y-2" role="status" aria-live="polite">
      {list.map(t => (
        <div key={t.id} className={`flex items-center gap-3 px-4 py-3 text-[14px] shadow-[0_2px_6px_rgba(0,0,0,.2)] ${t.error ? 'bg-[#fff1f1] border-l-[3px] border-[#da1e28] text-[#161616]' : 'bg-[#262626] text-[#f4f4f4]'}`}>
          <span className="flex-1">{t.message}</span>
          {t.undo && (
            <button type="button" disabled={undoing === t.id} className="h-8 px-2 text-[#78a9ff] hover:underline disabled:text-[#8d8d8d]"
              onClick={async () => { setUndoing(t.id); try { await t.undo!(); drop(t.id); } catch (e: any) { drop(t.id); push({ error: true, message: `Couldn't undo — ${e?.message || 'request failed'}` }); } finally { setUndoing(null); } }}>
              {undoing === t.id ? 'Restoring' : 'Undo'}
            </button>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => drop(t.id)} className="h-5 w-5 flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}

export function useListRemove<T extends { id: string }>({ queryKey, also = [], noun, name, remove, restore }: {
  queryKey: QueryKey; also?: QueryKey[]; noun: string; name: (row: T) => string;
  remove: (row: T) => Promise<unknown>; restore?: (row: T) => Promise<unknown>;
}) {
  const qc = useQueryClient();
  const push = useToasts(s => s.push);
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const inFlight = useRef(0);
  const [ask, setAsk] = useState<T | null>(null);
  const refresh = () => { if (inFlight.current === 0) [queryKey, ...also].forEach(k => qc.invalidateQueries({ queryKey: k })); };
  const run = async (row: T) => {
    inFlight.current++; setBusy(s => new Set(s).add(row.id));
    await qc.cancelQueries({ queryKey });
    const before = qc.getQueryData(queryKey);
    qc.setQueryData(queryKey, (old: any) => (Array.isArray(old) ? old.filter((r: any) => r.id !== row.id) : old));
    try {
      await remove(row);
      push({ message: `Removed ${noun} ${name(row)}`, undo: restore ? async () => { await restore(row); [queryKey, ...also].forEach(k => qc.invalidateQueries({ queryKey: k })); } : undefined });
    } catch (e: any) {
      if (before !== undefined && inFlight.current === 1) qc.setQueryData(queryKey, before);
      push({ error: true, message: `Couldn't remove ${noun} ${name(row)} — ${e?.message || 'request failed'}` });
    } finally {
      inFlight.current--; setBusy(s => { const n = new Set(s); n.delete(row.id); return n; }); refresh();
    }
  };
  const request = (row: T) => { if (busy.has(row.id)) return; if (restore) run(row); else setAsk(row); };
  const confirm = ask ? (
    <Modal title={`Delete ${noun} ${name(ask)}?`} danger submitLabel="Delete" onClose={() => setAsk(null)} onSubmit={() => { const r = ask; setAsk(null); run(r); }}>
      <p className="text-[14px] text-[#525252]">This cannot be undone.</p>
    </Modal>
  ) : null;
  return { request, isBusy: (id: string) => busy.has(id), confirm };
}
