'use client';
// One way to link, on every screen: a coloured chip per kind of thing, the same three counts in every header
// (Uses · Used by · Checked by), and a panel that opens beside instead of sending people to another menu.
import { createContext, useContext, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '@/lib/api';

export const KIND_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  qualify: { bg: '#e3f5e8', fg: '#0e5a2a', label: 'Who qualifies' },
  decision: { bg: '#e3f5e8', fg: '#0e5a2a', label: 'Decision' },
  amount: { bg: '#eef1ff', fg: '#2b3a8f', label: 'How much' },
  strategy: { bg: '#f1e8ff', fg: '#6a2bd1', label: 'Which one' },
  flow: { bg: '#f1e8ff', fg: '#6a2bd1', label: 'Flow' },
  model: { bg: '#e5efff', fg: '#0043ce', label: 'Model' },
  word: { bg: '#eef1f6', fg: '#3b4656', label: 'Word' },
  data: { bg: '#e0f4f4', fg: '#005d5d', label: 'Data set' },
  api: { bg: '#e8e8e8', fg: '#161616', label: 'API' },
};

export type LinkItem = { kind: string; id: string; name: string; note?: string; href?: string };

const BesideCtx = createContext<(it: LinkItem) => void>(() => {});
export const useOpenBeside = () => useContext(BesideCtx);

export function Chip({ item, onClick }: { item: LinkItem; onClick?: () => void }) {
  const open = useOpenBeside();
  const s = KIND_STYLE[item.kind] || KIND_STYLE.word;
  return (
    <button type="button" onClick={onClick || (() => open(item))} title={`${s.label}${item.note ? ` · ${item.note}` : ''}`}
      className="inline-flex items-center h-7 px-2.5 text-[13px] font-medium whitespace-nowrap hover:brightness-95"
      style={{ background: s.bg, color: s.fg, borderRadius: 14 }}>
      {item.name}{item.note === 'requested' && <span className="ml-1.5 text-[11px] opacity-75">requested</span>}
    </button>
  );
}

/** The panel beside: what the thing is, and its own links, without leaving the page. */
export function BesideProvider({ children }: { children: React.ReactNode }) {
  const [item, setItem] = useState<LinkItem | null>(null);
  return (
    <BesideCtx.Provider value={setItem}>
      {children}
      {item && <BesidePanel item={item} onClose={() => setItem(null)} />}
    </BesideCtx.Provider>
  );
}

function BesidePanel({ item, onClose }: { item: LinkItem; onClose: () => void }) {
  const s = KIND_STYLE[item.kind] || KIND_STYLE.word;
  const linkable = item.kind === 'decision' || item.kind === 'flow' || item.kind === 'qualify' || item.kind === 'amount' || item.kind === 'strategy';
  const { data } = useQuery({ queryKey: ['links', item.kind, item.id], enabled: linkable,
    queryFn: () => api.get<any>(`/platform/links/${item.kind === 'flow' || item.kind === 'strategy' ? 'flow' : 'rule'}/${item.id}`) });
  return (
    <aside aria-label={item.name} className="fixed right-0 top-12 bottom-0 z-40 w-[420px] max-w-full bg-white border-l border-[#e0e0e0] shadow-[-8px_0_24px_rgba(0,0,0,.08)] flex flex-col">
      <div className="h-1.5" style={{ background: s.fg }} />
      <div className="px-6 pt-5 pb-4 flex items-start gap-3 border-b border-[#e0e0e0]">
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold tracking-[.4px]" style={{ color: s.fg }}>{s.label.toUpperCase()}</div>
          <div className="text-[20px] leading-7 mt-1 break-words">{item.name}</div>
          {item.note && item.note !== 'requested' && <div className="text-[13px] text-[#525252] mt-1">{item.note}</div>}
          {item.note === 'requested' && <div className="text-[13px] text-[#8a5300] mt-1">Asked from IT · tested with a sample value meanwhile</div>}
        </div>
        <button aria-label="Close" onClick={onClose} className="h-8 w-8 flex items-center justify-center hover:bg-[#e8e8e8]"><X className="h-4 w-4" /></button>
      </div>
      {data && (
        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          <Group title="Uses" items={data.uses} empty="Nothing" />
          <Group title="Used by" items={data.usedBy} empty="Not used anywhere yet" />
          <div><div className="text-[12px] font-semibold tracking-[.4px] text-[#525252] mb-2">CHECKED BY</div>
            <div className="text-[14px]">{data.checks.total ? <span className={data.checks.fail ? 'text-[#da1e28]' : 'text-[#198038]'}>{data.checks.pass} of {data.checks.total} test cases pass</span> : 'No test cases yet'}</div></div>
        </div>
      )}
      <div className="mt-auto px-6 py-4 border-t border-[#e0e0e0]">
        {item.href && <Link href={item.href} onClick={onClose} className="inline-flex items-center h-10 px-4 pr-12 bg-[#0f62fe] text-white text-[14px] hover:bg-[#0353e9] hover:no-underline">Open</Link>}
      </div>
    </aside>
  );
}

function Group({ title, items, empty }: { title: string; items: LinkItem[]; empty: string }) {
  return (
    <div>
      <div className="text-[12px] font-semibold tracking-[.4px] text-[#525252] mb-2">{title.toUpperCase()}</div>
      {items.length ? <div className="flex flex-wrap gap-1.5">{items.map(it => <Chip key={`${it.kind}:${it.id}`} item={it} />)}</div> : <div className="text-[14px] text-[#6f6f6f]">{empty}</div>}
    </div>
  );
}

/** The three counts every header carries. Clicking one opens its list beside. */
export function LinksBar({ kind, id, name, href }: { kind: 'rule' | 'flow'; id: string; name: string; href?: string }) {
  const open = useOpenBeside();
  const { data } = useQuery({ queryKey: ['links', kind === 'flow' ? 'flow' : 'decision', id], queryFn: () => api.get<any>(`/platform/links/${kind}/${id}`) });
  if (!data) return null;
  const self: LinkItem = { kind: kind === 'flow' ? 'flow' : 'decision', id, name, href };
  const btn = 'h-8 px-3 text-[13px] bg-[#f4f4f4] hover:bg-[#e8e8e8] text-[#161616] inline-flex items-center gap-1.5';
  return (
    <div className="flex flex-wrap gap-2">
      <button className={btn} onClick={() => open(self)}>Uses <b className="font-semibold tabular-nums">{data.uses.length}</b></button>
      <button className={btn} onClick={() => open(self)}>Used by <b className="font-semibold tabular-nums">{data.usedBy.length}</b></button>
      <button className={btn} onClick={() => open(self)}>Checked by <b className={`font-semibold tabular-nums ${data.checks.fail ? 'text-[#da1e28]' : data.checks.total ? 'text-[#198038]' : ''}`}>{data.checks.total ? `${data.checks.pass}/${data.checks.total}` : 0}</b></button>
    </div>
  );
}
