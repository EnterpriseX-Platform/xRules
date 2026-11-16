'use client';
// Rule folders, used like packages: nested up to 5 levels, a folder shows the rules in it and in its
// sub-folders, rules are dragged onto a folder (or "All rules" to take them out), and removing a folder
// moves its rules up to the parent — never deletes them.
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Folder, FolderOpen, FolderPlus, MoreHorizontal, FileText } from 'lucide-react';
import { api } from '@/lib/api';

export interface FolderNode { id: string; name: string; parentId: string | null; ruleCount: number; children: FolderNode[] }

export const flatten = (nodes: FolderNode[], depth = 0, path: string[] = []): (FolderNode & { depth: number; path: string })[] =>
  nodes.flatMap(n => [{ ...n, depth, path: [...path, n.name].join(' / ') }, ...flatten(n.children || [], depth + 1, [...path, n.name])]);

export const subtreeIds = (nodes: FolderNode[], id: string): Set<string> => {
  const out = new Set<string>();
  const walk = (ns: FolderNode[], inside: boolean) => ns.forEach(n => { const on = inside || n.id === id; if (on) out.add(n.id); walk(n.children || [], on); });
  walk(nodes, false);
  return out;
};

export const DRAG_TYPE = 'application/x-xrules-rule';

export function FolderPanel({ projectId, folders, rules, folderId, setFolderId, canWrite }: {
  projectId: string; folders: FolderNode[]; rules: any[]; folderId: string | null;
  setFolderId: (id: string | null) => void; canWrite: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState<{ parentId: string | null } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const refresh = () => { qc.invalidateQueries({ queryKey: ['folders', projectId] }); qc.invalidateQueries({ queryKey: ['rules', projectId] }); };
  const count = (id: string) => { const ids = subtreeIds(folders, id); return rules.filter(r => r.folderId && ids.has(r.folderId)).length; };

  useEffect(() => {   // keep the selected folder's parents expanded
    if (!folderId) return;
    const chain = flatten(folders).find(f => f.id === folderId);
    if (!chain) return;
    const all = flatten(folders); let p = chain.parentId; const add = new Set(open);
    while (p) { add.add(p); p = all.find(f => f.id === p)?.parentId ?? null; }
    if (add.size !== open.size) setOpen(add);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, folders]);

  async function run(fn: () => Promise<any>) {
    setErr('');
    try { await fn(); refresh(); } catch (e: any) { setErr(e.message || String(e)); }
  }
  const drop = (target: string | null) => (e: React.DragEvent) => {
    e.preventDefault(); setOver(null);
    const id = e.dataTransfer.getData(DRAG_TYPE);
    if (id) run(() => api.post('/folders/move-item', { kind: 'rule', itemId: id, folderId: target }));
  };
  const dropProps = (target: string | null, key: string) => canWrite ? {
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); setOver(key); } },
    onDragLeave: () => setOver(o => (o === key ? null : o)),
    onDrop: drop(target),
  } : {};

  const row = (sel: boolean, key: string) =>
    `group flex items-center h-8 pr-1 text-[13px] cursor-pointer ${over === key ? 'outline outline-2 -outline-offset-2 outline-[#0f62fe] bg-[#edf5ff]' : sel ? 'bg-[#e0e0e0] text-[#161616] font-semibold' : 'text-[#393939] hover:bg-[#e8e8e8]'}`;

  function Node({ f, depth }: { f: FolderNode; depth: number }) {
    const isOpen = open.has(f.id); const kids = f.children || [];
    return (
      <div>
        {renaming === f.id ? (
          <NameInput initial={f.name} depth={depth} onCancel={() => setRenaming(null)}
            onSave={name => run(async () => { await api.patch(`/folders/${f.id}/rename`, { name }); setRenaming(null); })} />
        ) : (
          <div className={row(folderId === f.id, f.id)} style={{ paddingLeft: 4 + depth * 14 }} onClick={() => setFolderId(f.id)} {...dropProps(f.id, f.id)}
            role="treeitem" aria-selected={folderId === f.id} aria-expanded={kids.length ? isOpen : undefined}>
            <button type="button" aria-label={isOpen ? 'Collapse' : 'Expand'} onClick={e => { e.stopPropagation(); const n = new Set(open); isOpen ? n.delete(f.id) : n.add(f.id); setOpen(n); }}
              className={`h-6 w-5 flex items-center justify-center shrink-0 ${kids.length ? '' : 'invisible'}`}>
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </button>
            {folderId === f.id ? <FolderOpen className="h-4 w-4 mr-2 shrink-0 text-[#0f62fe]" /> : <Folder className="h-4 w-4 mr-2 shrink-0" />}
            <span className="flex-1 truncate">{f.name}</span>
            <span className="text-[12px] text-[#6f6f6f] tabular-nums px-1 font-normal">{count(f.id)}</span>
            {canWrite && <span className="relative">
              <button type="button" aria-label={`Folder actions ${f.name}`} onClick={e => { e.stopPropagation(); setMenu(menu === f.id ? null : f.id); setConfirmDel(null); }}
                className={`h-7 w-7 flex items-center justify-center hover:bg-[#c6c6c6] ${menu === f.id ? 'visible bg-[#c6c6c6]' : 'invisible group-hover:visible'}`}>
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {menu === f.id && <Menu onClose={() => { setMenu(null); setConfirmDel(null); }}>
                {confirmDel === f.id ? <>
                  <div className="px-3 py-2 text-[13px] text-[#525252] max-w-[220px] whitespace-normal">Remove “{f.name}”? Its rules move to {f.parentId ? 'the parent folder' : 'All rules'}.</div>
                  <MenuItem danger onClick={() => run(async () => { await api.del(`/folders/${f.id}`); setMenu(null); if (folderId && subtreeIds(folders, f.id).has(folderId)) setFolderId(f.parentId); })}>Remove folder</MenuItem>
                </> : <>
                  {depth < 4 && <MenuItem onClick={() => { setMenu(null); setCreating({ parentId: f.id }); setOpen(new Set(open).add(f.id)); }}>New sub-folder</MenuItem>}
                  <MenuItem onClick={() => { setMenu(null); setRenaming(f.id); }}>Rename</MenuItem>
                  <MenuItem danger onClick={() => setConfirmDel(f.id)}>Remove</MenuItem>
                </>}
              </Menu>}
            </span>}
          </div>
        )}
        {isOpen && kids.map(k => <Node key={k.id} f={k} depth={depth + 1} />)}
        {creating?.parentId === f.id && <NameInput depth={depth + 1} onCancel={() => setCreating(null)}
          onSave={name => run(async () => { await api.post('/folders', { projectId, name, parentId: f.id }); setCreating(null); })} />}
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#e0e0e0] self-start" role="tree" aria-label="Folders">
      <div className="flex items-center justify-between h-10 pl-3 pr-1 border-b border-[#e0e0e0]">
        <span className="text-[14px] font-semibold text-[#161616]">Folders</span>
        {canWrite && <button type="button" aria-label="New folder" title="New folder" onClick={() => setCreating({ parentId: null })}
          className="h-8 w-8 flex items-center justify-center hover:bg-[#e8e8e8] text-[#0f62fe]"><FolderPlus className="h-4 w-4" /></button>}
      </div>
      <div className="py-1">
        <div className={row(folderId === null, '_root')} style={{ paddingLeft: 8 }} onClick={() => setFolderId(null)} {...dropProps(null, '_root')} role="treeitem" aria-selected={folderId === null}>
          <FileText className="h-4 w-4 mr-2 shrink-0" /><span className="flex-1">All rules</span>
          <span className="text-[12px] text-[#6f6f6f] tabular-nums px-2 font-normal">{rules.length}</span>
        </div>
        {folders.map(f => <Node key={f.id} f={f} depth={0} />)}
        {creating?.parentId === null && <NameInput depth={0} onCancel={() => setCreating(null)}
          onSave={name => run(async () => { await api.post('/folders', { projectId, name }); setCreating(null); })} />}
      </div>
      {err && <div className="px-3 py-2 text-[12px] text-[#da1e28] border-t border-[#e0e0e0]">{err}</div>}
    </div>
  );
}

function NameInput({ initial = '', depth, onSave, onCancel }: { initial?: string; depth: number; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  return (
    <form className="flex items-center h-9 pr-1" style={{ paddingLeft: 24 + depth * 14 }} onSubmit={e => { e.preventDefault(); if (v.trim()) onSave(v.trim()); }}>
      <Folder className="h-4 w-4 mr-2 shrink-0 text-[#525252]" />
      <input autoFocus aria-label="Folder name" value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === 'Escape' && onCancel()} onBlur={() => (v.trim() && v.trim() !== initial ? onSave(v.trim()) : onCancel())}
        placeholder="Folder name" className="flex-1 min-w-0 h-7 px-2 text-[13px] bg-[#f4f4f4] border-b border-[#8d8d8d] outline-none focus:border-[#0f62fe]" />
    </form>
  );
}

function Menu({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as any)) onClose(); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return <div ref={ref} role="menu" onClick={e => e.stopPropagation()} className="absolute right-0 top-8 z-40 min-w-[180px] bg-white border border-[#e0e0e0] shadow-[0_2px_6px_rgba(0,0,0,.2)] font-normal">{children}</div>;
}
function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return <button type="button" role="menuitem" onClick={onClick} className={`w-full text-left h-9 px-3 text-[13px] ${danger ? 'text-[#da1e28] hover:bg-[#fff1f1]' : 'text-[#161616] hover:bg-[#e8e8e8]'}`}>{children}</button>;
}
