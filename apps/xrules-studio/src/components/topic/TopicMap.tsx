'use client';
// A topic opens on its map: what comes in (words) → what is decided here (numbered boxes) → what goes out.
// Clicking a box opens it beside the shrunken map: what it does in words, Uses / Used by / Checked by, and actions.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { useTerms } from '@/lib/terms';
import { kindName } from '@/lib/kinds';
import { useDevMode } from '@/lib/devmode';
import { tableSentences } from '@/components/review/sentences';
import { Chip, type LinkItem } from '@/components/links/Links';
import { StrategySteps } from './StrategySteps';

const Q_LABEL: Record<string, string> = { qualify: 'Who qualifies', amount: 'How much', choose: 'Which one' };
type Box = { n: number; d: any; group: string };
type Word = { id: string; name: string; note?: string; requested: boolean; href?: string; by: string[] };
type Out = { id: string; name: string; sub: string; item?: LinkItem; from: string[] };

const linesOf = (d: any) => d.type === 'DECISION_TABLE' ? (d.definition?.rules || []).length : d.type === 'FORMULA' ? (d.definition?.lines || []).length : null;
const state = (d: any) => d.reviewState === 'PENDING' ? 'waiting for approval' : d.status === 'published' ? `live v${d.version}` : 'draft';
const tests = (d: any) => d.tests?.total ? `tests ${d.tests.pass}/${d.tests.total}` : '';
const href = (pid: string, d: any) => d.kind === 'flow' ? `/p/${pid}/flows/${d.id}` : `/p/${pid}/rules/${d.id}`;

export function TopicMap({ projectId, topic, onTab }: { projectId: string; topic: any; onTab: (k: any) => void }) {
  const { label } = useTerms(projectId);
  const ds: any[] = topic.decisions || [];
  const [open, setOpen] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  // numbered boxes, grouped by question or by step
  const groups = useMemo(() => {
    let n = 0;
    if (topic.shape === 'steps') {
      const placed = new Set<string>();
      const gs = (topic.stages || []).map((st: any, i: number) => ({ title: `${i + 1} · ${st.name}`, boxes: st.items.map((id: string) => ds.find(d => d.id === id)).filter(Boolean).map((d: any) => { placed.add(d.id); return { n: ++n, d, group: st.name } as Box; }) }));
      const loose = ds.filter(d => !placed.has(d.id));
      if (loose.length) gs.push({ title: 'Not in a step', boxes: loose.map(d => ({ n: ++n, d, group: '' })) });
      return gs as { title: string; boxes: Box[] }[];
    }
    return ['qualify', 'amount', 'choose'].map((q, i) => ({ title: `${i + 1} · ${Q_LABEL[q]}`, boxes: ds.filter(d => d.question === q).map(d => ({ n: ++n, d, group: Q_LABEL[q] } as Box)) }));
  }, [topic, ds]);
  const boxes = groups.flatMap(g => g.boxes);
  const numOf = (id: string) => boxes.find(b => b.d.id === id)?.n;

  const { data: links } = useQuery({ queryKey: ['topic-links', topic.id, ds.map(d => d.id).join()],
    queryFn: async () => { const m: Record<string, any> = {}; await Promise.all(ds.map(async d => { m[d.id] = await api.get<any>(`/platform/links/${d.kind === 'flow' ? 'flow' : 'rule'}/${d.id}`).catch(() => null); })); return m; } });

  const { words, outs, inner } = useMemo(() => {
    const w = new Map<string, Word>(); const o = new Map<string, Out>(); const inner: [string, string][] = [];
    const inTopic = new Set<string>(ds.map(d => d.id));
    const usedInside = new Set<string>();
    for (const d of ds) {
      const l = links?.[d.id]; if (!l) continue;
      for (const u of l.uses) {
        if (u.kind === 'word' || u.kind === 'data') {
          const x = w.get(u.id) || { id: u.id, name: u.name, note: u.kind === 'data' ? 'data set' : undefined, requested: u.note === 'requested', href: u.href, by: [] as string[] };
          x.by.push(d.id); w.set(u.id, x);
        } else if (inTopic.has(u.id)) { inner.push([u.id, d.id]); usedInside.add(u.id); }
      }
      for (const u of l.usedBy) {
        if (inTopic.has(u.id)) continue;
        const x = o.get(u.id) || { id: u.id, name: u.name, sub: u.kind === 'api' ? `API${u.note ? ` · ${u.note}` : ''}` : 'used by flow', item: u, from: [] as string[] };
        x.from.push(d.id); o.set(u.id, x);
      }
    }
    // results: what the boxes nothing else in this topic uses hand back
    for (const d of ds) {
      if (usedInside.has(d.id)) continue;
      const names: string[] = d.kind === 'rule' ? (d.definition?.outputs || []).map((x: any) => x?.name).filter(Boolean) : (d.graph?.nodes || []).filter((x: any) => x.type === 'output').map((x: any) => x.data?.label).filter(Boolean);
      const lines: string[] = d.type === 'FORMULA' ? (d.definition?.lines || []).map((x: any) => x?.name).filter(Boolean).slice(-1) : [];
      const res = [...names, ...lines].map(x => label(x));
      if (res.length) o.set(`r:${d.id}`, { id: `r:${d.id}`, name: Array.from(new Set(res)).join(' · '), sub: 'result', from: [d.id] });
    }
    return { words: Array.from(w.values()), outs: Array.from(o.values()), inner };
  }, [ds, links, label]);

  // connecting lines, measured from the drawn boxes
  const wrap = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<{ d: string; on: string[] }[]>([]);
  const last = useRef('');
  useLayoutEffect(() => {
    const el = wrap.current; if (!el || open) return;
    const draw = () => {
      const base = el.getBoundingClientRect();
      const at = (k: string) => { const n = el.querySelector(`[data-node="${CSS.escape(k)}"]`) as HTMLElement | null; if (!n) return null; const r = n.getBoundingClientRect(); return { l: r.left - base.left, r: r.right - base.left, y: r.top - base.top + Math.min(r.height / 2, 22) }; };
      const curve = (a: any, b: any) => { const mx = (a.r + b.l) / 2; return `M${a.r},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.l},${b.y}`; };
      const out: { d: string; on: string[] }[] = [];
      words.forEach(wd => wd.by.forEach(id => { const a = at(`w:${wd.id}`), b = at(`b:${id}`); if (a && b) out.push({ d: curve(a, b), on: [id] }); }));
      outs.forEach(ot => ot.from.forEach(id => { const a = at(`b:${id}`), b = at(`o:${ot.id}`); if (a && b) out.push({ d: curve(a, b), on: [id] }); }));
      inner.forEach(([from, to]) => { const a = at(`b:${from}`), b = at(`b:${to}`); if (a && b) { const x = a.r + 14; out.push({ d: `M${a.r},${a.y} C${x},${a.y} ${x},${b.y} ${b.r},${b.y}`, on: [from, to] }); } });
      const sig = JSON.stringify(out); if (sig !== last.current) { last.current = sig; setPaths(out); }
    };
    draw(); const ro = new ResizeObserver(draw); ro.observe(el); return () => ro.disconnect();
  }, [words, outs, inner, open]);

  const sel = boxes.find(b => b.d.id === open);
  const lit = (ids: string[]) => !!hover && ids.includes(hover);

  if (sel) return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <nav aria-label="Map" className="bg-white border border-[#e0e0e0] text-[14px] self-start">
        <button className="w-full text-left px-4 py-3 border-b border-[#e0e0e0] text-[#525252] hover:bg-[#f4f4f4]" onClick={() => setOpen(null)}>Words in · {words.length}</button>
        {groups.map(g => (
          <div key={g.title} className="border-b border-[#e0e0e0]">
            <div className="px-4 pt-3 pb-1 text-[12px] text-[#6f6f6f]">{g.title}</div>
            {g.boxes.map(b => <button key={b.d.id} onClick={() => setOpen(b.d.id)} className={`w-full text-left px-4 py-2 border-l-2 ${b.d.id === open ? 'border-[#0f62fe] bg-[#edf5ff]' : 'border-transparent hover:bg-[#f4f4f4]'}`}>{b.n} · {b.d.name}</button>)}
            {!g.boxes.length && <div className="px-4 pb-2 text-[#6f6f6f]">Nothing yet</div>}
          </div>
        ))}
        <button className="w-full text-left px-4 py-3 text-[#525252] hover:bg-[#f4f4f4]" onClick={() => setOpen(null)}>Goes out · {outs.length}</button>
      </nav>
      <BoxPanel projectId={projectId} box={sel} links={links?.[sel.d.id]} label={label} numOf={numOf} onPick={setOpen} onClose={() => setOpen(null)} onTab={onTab} ds={ds} />
    </div>
  );

  return (
    <div ref={wrap} className="relative grid gap-x-16 gap-y-6 lg:grid-cols-[220px_minmax(0,1fr)_240px]">
      <svg className="absolute inset-0 w-full h-full pointer-events-none hidden lg:block" aria-hidden>
        {paths.map((p, i) => <path key={i} d={p.d} fill="none" stroke={lit(p.on) ? '#0f62fe' : '#c6c6c6'} strokeWidth={lit(p.on) ? 2 : 1} />)}
      </svg>
      <section>
        <h2 className="m-0 mb-3 text-[12px] font-semibold tracking-[.4px] text-[#525252]">COMES IN · words</h2>
        <div className="space-y-2">
          {words.map(w => (
            <div key={w.id} data-node={`w:${w.id}`} className={`relative bg-white px-3 py-2 border ${w.requested ? 'border-dashed border-[#8d8d8d]' : 'border-[#e0e0e0]'}`}>
              <Chip item={{ kind: w.note === 'data set' ? 'data' : 'word', id: w.id, name: w.name, note: w.requested ? 'requested' : undefined, href: w.href }} />
              {(w.requested || w.note) && <div className="text-[12px] text-[#6f6f6f] mt-0.5">{w.requested ? 'asked from IT' : w.note}</div>}
            </div>
          ))}
          {links && !words.length && <div className="text-[14px] text-[#6f6f6f]">No words used yet</div>}
        </div>
      </section>
      <section>
        <h2 className="m-0 mb-3 text-[12px] font-semibold tracking-[.4px] text-[#525252]">IS DECIDED · in this topic</h2>
        <div className="space-y-5">
          {groups.map(g => (
            <div key={g.title}>
              <div className="text-[13px] text-[#525252] mb-1.5">{g.title}</div>
              <div className="space-y-2">
                {g.boxes.map(b => {
                  const n = linesOf(b.d); const uses = inner.filter(([, to]) => to === b.d.id).map(([f]) => numOf(f)).filter(Boolean);
                  const meta = [n != null ? `${n.toLocaleString()} line${n === 1 ? '' : 's'}` : kindName(b.d.type), uses.length ? `uses ${uses.join(' and ')}` : '', tests(b.d), state(b.d)].filter(Boolean).join(' · ');
                  const bad = (b.d.tests?.fail || 0) > 0;
                  return (
                    <button key={b.d.id} data-node={`b:${b.d.id}`} onClick={() => setOpen(b.d.id)} onMouseEnter={() => setHover(b.d.id)} onMouseLeave={() => setHover(null)}
                      className={`relative w-full text-left bg-white border px-4 py-3 grid grid-cols-[28px_minmax(0,1fr)] hover:border-[#0f62fe] ${hover === b.d.id ? 'border-[#0f62fe]' : 'border-[#8d8d8d]'}`}>
                      <span className="text-[14px] text-[#525252] tabular-nums">{b.n}</span>
                      <span><span className="block text-[16px] text-[#161616]">{b.d.name}</span><span className={`block text-[13px] mt-0.5 ${bad ? 'text-[#da1e28]' : 'text-[#525252]'}`}>{meta}</span></span>
                    </button>
                  );
                })}
                {!g.boxes.length && <button className="text-[14px] text-[#0f62fe] hover:underline" onClick={() => onTab(topic.shape === 'steps' ? 'steps' : (['qualify', 'amount', 'choose'][groups.indexOf(g)]))}>Add one</button>}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="m-0 mb-3 text-[12px] font-semibold tracking-[.4px] text-[#525252]">GOES OUT</h2>
        <div className="space-y-2">
          {outs.map(o => (
            <div key={o.id} data-node={`o:${o.id}`} className="relative bg-white border border-[#e0e0e0] px-3 py-2">
              {o.item ? <Chip item={o.item} /> : <span className="text-[14px] text-[#161616]">{o.name}</span>}
              <div className="text-[12px] text-[#6f6f6f] mt-0.5">{o.sub}</div>
            </div>
          ))}
          {links && !outs.length && <div className="text-[14px] text-[#6f6f6f]">Nothing goes out yet</div>}
        </div>
      </section>
    </div>
  );
}

function BoxPanel({ projectId, box, links, label, numOf, onPick, onClose, onTab, ds }: { projectId: string; box: Box; links: any; label: (p: string) => string; numOf: (id: string) => number | undefined; onPick: (id: string) => void; onClose: () => void; onTab: (k: any) => void; ds: any[] }) {
  const d = box.d; const [dev] = useDevMode();
  const lines = d.type === 'DECISION_TABLE' ? tableSentences(d.definition, label) : [];
  const ruleChip = (slug: string) => { const r = ds.find(x => x.kind === 'rule' && (x.slug === slug || x.id === slug)); return r ? { kind: r.question === 'amount' ? 'amount' : 'qualify', id: r.id, name: r.name, href: href(projectId, r) } as LinkItem : null; };
  const item = (it: LinkItem) => numOf(it.id) ? <button className="text-[#0f62fe] underline underline-offset-[3px]" onClick={() => onPick(it.id)}>{it.name}</button> : <Chip item={it} />;
  const H = ({ children }: { children: React.ReactNode }) => <h3 className="m-0 mb-2 text-[12px] font-semibold tracking-[.4px] text-[#525252]">{children}</h3>;
  const act = 'h-10 px-4 inline-flex items-center text-[14px] border border-[#8d8d8d] text-[#161616] hover:bg-[#e8e8e8] hover:no-underline';
  return (
    <section className="bg-white border border-[#e0e0e0] min-w-0">
      <div className="px-6 pt-5 pb-4 flex items-start gap-3 border-b border-[#e0e0e0]">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-[#525252]">{box.n} · {box.group || kindName(d.type)}</div>
          <h2 className="m-0 text-[22px] leading-8 text-[#161616]">{d.name}</h2>
          <div className="text-[13px] text-[#525252] mt-1">{[kindName(d.type), state(d)].join(' · ')}</div>
        </div>
        <button aria-label="Back to map" onClick={onClose} className="h-8 px-2 flex items-center gap-1 text-[14px] text-[#0f62fe] hover:bg-[#e8e8e8]"><X className="h-4 w-4" />Back to map</button>
      </div>
      <div className="grid gap-8 px-6 py-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <div className="flex items-baseline gap-4"><H>WHAT IT DOES</H><span className="flex-1" /><Link href={href(projectId, d)} className="text-[13px]">Edit</Link></div>
          {d.type === 'DECISION_TABLE' && (<>
            <ol className="m-0 pl-0 list-none space-y-1.5 text-[15px] leading-[24px]">{lines.slice(0, 8).map((s, i) => <li key={i} className="flex gap-3"><span className="text-[#6f6f6f] tabular-nums w-6 shrink-0">{i + 1}</span><span>{s}</span></li>)}</ol>
            {lines.length > 8 && <Link href={href(projectId, d)} className="inline-block mt-2 text-[14px]">and {(lines.length - 8).toLocaleString()} more lines</Link>}
            {!lines.length && <div className="text-[14px] text-[#6f6f6f]">No lines yet</div>}
          </>)}
          {d.type === 'FORMULA' && <div className="space-y-1 text-[15px] leading-[26px]">{(d.definition?.lines || []).map((l: any, i: number) => <div key={i}><b className="font-semibold">{label(l.name)}</b> = {String(l.expr || '').replace(/[A-Za-z_][\w]*/g, (w: string) => (/^(SUM|AVG|COUNT|MIN|MAX|ROUND|ROUNDDOWN|ROUNDUP|IF)$/.test(w) ? w : label(w))).replace(/\*/g, '×').replace(/\//g, '÷')}</div>)}</div>}
          {d.kind === 'flow' && <StrategySteps graph={d.graph} label={label} ruleChip={ruleChip} />}
          {d.type !== 'DECISION_TABLE' && d.type !== 'FORMULA' && d.kind !== 'flow' && <div className="text-[14px] text-[#6f6f6f]">{kindName(d.type)}; open it to read</div>}
        </div>
        <aside className="space-y-5 text-[14px] xl:border-l xl:border-[#e0e0e0] xl:pl-6">
          <div><H>USES</H>{links?.uses?.length ? <ul className="m-0 p-0 list-none space-y-1.5">{links.uses.map((u: LinkItem) => <li key={u.kind + u.id}>{item(u)} <span className="text-[#6f6f6f]">{u.kind === 'word' ? 'word' : u.kind === 'data' ? 'data set' : 'decision'}</span></li>)}</ul> : <div className="text-[#6f6f6f]">Nothing</div>}</div>
          <div><H>USED BY</H>{links?.usedBy?.length ? <ul className="m-0 p-0 list-none space-y-1.5">{links.usedBy.map((u: LinkItem) => <li key={u.kind + u.id}>{item(u)} <span className="text-[#6f6f6f]">{u.kind === 'api' ? `API${u.note ? ` · ${u.note}` : ''}` : 'flow'}</span></li>)}</ul> : <div className="text-[#6f6f6f]">Not used anywhere yet</div>}</div>
          <div><H>CHECKED BY</H>{links?.checks?.total ? <div className={links.checks.fail ? 'text-[#da1e28]' : 'text-[#198038]'}>{links.checks.total} test case{links.checks.total === 1 ? '' : 's'} · {links.checks.fail ? `${links.checks.fail} fail` : links.checks.pass === links.checks.total ? 'all pass' : `${links.checks.pass} pass`}</div> : <div className="text-[#6f6f6f]">No test cases yet</div>}</div>
        </aside>
      </div>
      <div className="px-6 py-4 border-t border-[#e0e0e0] flex flex-wrap gap-2">
        <Link className={act} href={d.kind === 'flow' ? href(projectId, d) : `/p/${projectId}/rules/${d.id}/tests`}>Test cases</Link>
        <button className={act} onClick={() => onTab('simulate')}>Try on real data</button>
        {d.kind === 'rule' && <Link className={act} href={`/p/${projectId}/rules/${d.id}/versions`}>History</Link>}
        {dev && <Link className={act} href={href(projectId, d)}>{d.kind === 'flow' ? 'Open as flow (developers)' : 'Open editor (developers)'}</Link>}
      </div>
    </section>
  );
}
