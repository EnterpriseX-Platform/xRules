'use client';
// One way to remove a row from a list, used by every list in the studio:
//  - with Undo the row stays where it is, greyed and marked Removed (the cached list is patched locally, no refetch),
//    so no row ever moves under the pointer; without Undo it leaves at once after the confirm dialog;
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
    qc.setQueryData(queryKey, (old: any) => (Array.isArray(old) ? (restore ? old.map((r: any) => (r.id === row.id ? { ...r, _removed: true } : r)) : old.filter((r: any) => r.id !== row.id)) : old));
    try {
      await remove(row);
      push({ message: `Removed ${noun} ${name(row)}`, undo: restore ? () => undo(row) : undefined });
    } catch (e: any) {
      if (before !== undefined && inFlight.current === 1) qc.setQueryData(queryKey, before);
      push({ error: true, message: `Couldn't remove ${noun} ${name(row)} — ${e?.message || 'request failed'}` });
    } finally {
      inFlight.current--; setBusy(s => { const n = new Set(s); n.delete(row.id); return n; }); if (!restore) refresh();
    }
  };
  const undo = async (row: T) => { await restore!(row); [queryKey, ...also].forEach(k => qc.invalidateQueries({ queryKey: k })); };
  const request = (row: T) => { if (busy.has(row.id) || (row as any)._removed) return; if (restore) run(row); else setAsk(row); };
  const confirm = ask ? (
    <Modal title={`Delete ${noun} ${name(ask)}?`} danger submitLabel="Delete" onClose={() => setAsk(null)} onSubmit={() => { const r = ask; setAsk(null); run(r); }}>
      <p className="text-[14px] text-[#525252]">This cannot be undone.</p>
    </Modal>
  ) : null;
  /** The row's buttons are off while its removal runs or after it is removed. */
  const isBusy = (row: T) => busy.has(row.id) || !!(row as any)._removed;
  const isRemoved = (row: T) => !!(row as any)._removed;
  return { request, isBusy, isRemoved, undo, confirm };
}

/** The action cell of a row removed with Undo: it keeps its place until the list is next loaded. */
export function RemovedCell({ onUndo }: { onUndo: () => Promise<unknown> }) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  return (
    <span className="inline-flex items-center gap-1 no-underline" onClick={e => e.stopPropagation()}>
      <span className="px-3 text-[#6f6f6f]">{state === 'failed' ? "Couldn't undo" : 'Removed'}</span>
      <button type="button" disabled={state === 'busy'} className="h-8 px-3 text-[#0f62fe] hover:bg-[#e8e8e8] disabled:text-[#8d8d8d]"
        onClick={async () => { setState('busy'); try { await onUndo(); setState('idle'); } catch { setState('failed'); } }}>{state === 'busy' ? 'Restoring' : 'Undo'}</button>
    </span>
  );
}

/** Remove many rows at once: they stay greyed and marked Removed in place, one toast offers Undo for all of them. */
export function useBulkRemove<T extends { id: string }>({ queryKey, also = [], noun, remove, restore }: {
  queryKey: QueryKey; also?: QueryKey[]; noun: string; remove: (rows: T[]) => Promise<unknown>; restore: (rows: T[]) => Promise<unknown>;
}) {
  const qc = useQueryClient();
  const push = useToasts(s => s.push);
  const [busy, setBusy] = useState(false);
  const mark = (ids: Set<string>, on: boolean) => qc.setQueryData(queryKey, (old: any) => (Array.isArray(old) ? old.map((r: any) => (ids.has(r.id) ? { ...r, _removed: on } : r)) : old));
  const removeMany = async (rows: T[]) => {
    const live = rows.filter(r => !(r as any)._removed); if (busy || !live.length) return;
    const ids = new Set(live.map(r => r.id)); const what = `${live.length} ${noun}${live.length === 1 ? '' : 's'}`;
    setBusy(true); await qc.cancelQueries({ queryKey }); mark(ids, true);
    try {
      await remove(live);
      push({ message: `Removed ${what}`, undo: async () => { await restore(live); [queryKey, ...also].forEach(k => qc.invalidateQueries({ queryKey: k })); } });
    } catch (e: any) { mark(ids, false); push({ error: true, message: `Couldn't remove ${what} — ${e?.message || 'request failed'}` }); }
    finally { setBusy(false); }
  };
  const undoOne = async (row: T) => { await restore([row]); mark(new Set([row.id]), false); also.forEach(k => qc.invalidateQueries({ queryKey: k })); };
  return { removeMany, undoOne, busy, isRemoved: (row: T) => !!(row as any)._removed };
}
