'use client';
// Keyboard shortcuts: "?" shows this sheet; "g" then a letter goes to a page.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { useProject } from '@/lib/store';

const typing = (t: EventTarget | null) => { const el = t as HTMLElement | null; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || !!el.closest?.('.monaco-editor')); };

export function Shortcuts() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const projectId = useProject(s => s.currentProjectId);
  const g = useRef(0);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') { e.preventDefault(); setOpen(v => !v); return; }
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key === 'g') { g.current = Date.now(); return; }
      if (Date.now() - g.current < 1200) {
        g.current = 0;
        const to: Record<string, string> = { h: '/', p: '/projects', a: projectId ? `/p/${projectId}/approvals` : '/approvals',
          ...(projectId ? { t: `/p/${projectId}/topics`, r: `/p/${projectId}/rules`, f: `/p/${projectId}/flows?kind=DECISION`, v: `/p/${projectId}/vocabulary` } : {}) };
        if (to[e.key]) { e.preventDefault(); router.push(to[e.key]); }
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [projectId, router]);
  if (!open) return null;
  const rows: [string, string][] = [['⌘ K', 'Search and actions'], ['⌘ ;', 'Assistant'], ['?', 'This list'], ['Esc', 'Close'],
    ['g  h', 'Home'], ['g  p', 'Projects'], ['g  t', 'Topics'], ['g  r', 'Rules'], ['g  f', 'Decision flows'], ['g  v', 'Vocabulary'], ['g  a', 'Approvals']];
  return (
    <div className="fixed inset-0 z-[70] bg-[#161616]/50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div role="dialog" aria-label="Keyboard shortcuts" className="bg-white w-full max-w-[440px]" onClick={e => e.stopPropagation()}>
        <div className="h-14 px-5 flex items-center justify-between border-b border-[#e0e0e0]"><span className="text-[16px]">Keyboard shortcuts</span>
          <button className="h-8 w-8 flex items-center justify-center hover:bg-[#e8e8e8]" aria-label="Close" onClick={() => setOpen(false)}><X className="h-4 w-4" /></button></div>
        <div className="py-2">{rows.map(([k, v]) => (
          <div key={k} className="px-5 h-10 flex items-center justify-between text-[14px]"><span>{v}</span><kbd className="px-2 h-6 flex items-center text-[12px] border border-[#c6c6c6] bg-[#f4f4f4] font-sans tabular-nums">{k}</kbd></div>))}</div>
      </div>
    </div>
  );
}
