'use client';
// A topic read as a page: its goal, then each question it answers in sentences, formulas and step cards, with
// live checks beside. Everything mentioned is a chip that opens beside; nothing sends you to another menu.
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useTerms } from '@/lib/terms';
import { tableSentences } from '@/components/review/sentences';
import { Chip, type LinkItem } from '@/components/links/Links';
import { StrategySteps } from './StrategySteps';

const SERIF = "'IBM Plex Serif', Georgia, 'Times New Roman', serif";
const H2 = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <h2 className="m-0 text-[13px] font-semibold tracking-[.6px] text-[#6f6f6f]">{n} · {children}</h2>
);

function Checks({ t }: { t: { total: number; pass: number; fail?: number } }) {
  if (!t.total) return <span className="text-[13px] text-[#6f6f6f]">No examples yet</span>;
  const bad = (t.fail || 0) > 0;
  return <span className={`text-[13px] ${bad ? 'text-[#da1e28]' : t.pass === t.total ? 'text-[#198038]' : 'text-[#6f6f6f]'}`}>{bad ? `${t.pass} of ${t.total} example${t.total === 1 ? '' : 's'} pass` : t.pass === t.total ? `${t.total} example${t.total === 1 ? '' : 's'} pass${t.total === 1 ? 'es' : ''}` : `${t.total - t.pass} examples not run`}</span>;
}
function State({ d }: { d: any }) {
  return <span className="text-[13px] text-[#6f6f6f]">{d.reviewState === 'PENDING' ? 'Waiting for approval' : d.status === 'published' ? `Live v${d.version}` : 'Draft'}</span>;
}

export function TopicDoc({ projectId, topic, onTab }: { projectId: string; topic: any; onTab: (k: any) => void }) {
  const { label } = useTerms(projectId);
  const ds: any[] = topic.decisions || [];
  const q = (k: string) => ds.filter(d => d.question === k);
  const ruleItem = (d: any): LinkItem => ({ kind: d.question === 'amount' ? 'amount' : 'qualify', id: d.id, name: d.name, href: `/p/${projectId}/rules/${d.id}` });
  const bySlug = (slug: string) => { const r = ds.find(d => d.kind === 'rule' && (d.slug === slug || d.id === slug)); return r ? ruleItem(r) : null; };
  const sim = topic.lastSimulation;
  const pending = ds.filter(d => d.reviewState === 'PENDING').length;
  const drafts = ds.filter(d => d.status !== 'published' && d.reviewState !== 'PENDING').length;
  const failing = ds.filter(d => (d.tests.fail || 0) > 0);
  const { data: feeds } = useQuery({ queryKey: ['topic-feeds', topic.id, ds.map(d => d.id).join()],
    queryFn: async () => { const all = await Promise.all(ds.map(d => api.get<any>(`/platform/links/${d.kind === 'flow' ? 'flow' : 'rule'}/${d.id}`).catch(() => null))); const m = new Map<string, LinkItem>(); all.forEach(a => a?.usedBy?.forEach((u: LinkItem) => { if (u.kind === 'api' && !m.has(u.id)) m.set(u.id, u); })); return Array.from(m.values()); } });

  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_300px] -mt-2">
      <article className="max-w-[860px] min-w-0">
        <section className="mt-2">
          <H2 n={1}>WHO QUALIFIES</H2>
          {q('qualify').map(d => {
            const lines = d.type === 'DECISION_TABLE' ? tableSentences(d.definition, label) : [];
            return (
              <div key={d.id} className="mt-4 bg-white shadow-[0_0_0_1px_#e2ddd2] px-6 py-5">
                <div className="flex items-baseline gap-4 flex-wrap"><Chip item={ruleItem(d)} /><State d={d} /><Checks t={d.tests} /><span className="flex-1" /><Link href={`/p/${projectId}/rules/${d.id}`} className="text-[13px]">Edit lines</Link></div>
                <ol className="m-0 mt-3 pl-0 list-none space-y-1.5 text-[16px] leading-[26px]">
                  {lines.slice(0, 4).map((s, i) => <li key={i} className="flex gap-3"><span className="text-[#8a8478] tabular-nums w-5 shrink-0">{i + 1}</span><span>{s}</span></li>)}
                </ol>
                {lines.length > 4 && <Link href={`/p/${projectId}/rules/${d.id}`} className="inline-block mt-2 text-[14px]">and {lines.length - 4} more lines</Link>}
              </div>
            );
          })}
          {!q('qualify').length && <button className="mt-3 text-[14px] text-[#0f62fe]" onClick={() => onTab('qualify')}>Say who qualifies</button>}
        </section>

        <section className="mt-10">
          <H2 n={2}>HOW MUCH IT MATTERS</H2>
          {q('amount').map(d => (
            <div key={d.id} className="mt-4 bg-white shadow-[0_0_0_1px_#e2ddd2,0_8px_24px_rgba(60,50,30,.05)] px-6 py-5">
              <div className="flex items-baseline gap-4 flex-wrap"><Chip item={ruleItem(d)} /><State d={d} /><Checks t={d.tests} /><span className="flex-1" /><Link href={`/p/${projectId}/rules/${d.id}`} className="text-[13px]">Edit formula</Link></div>
              <div className="mt-3 font-mono text-[16px] leading-[28px]">
                {(d.definition?.lines || []).map((l: any, i: number) => <div key={i}><b className="font-semibold">{label(l.name)}</b> = {String(l.expr || '').replace(/[A-Za-z_][\w]*/g, (w: string) => (/^(SUM|AVG|COUNT|MIN|MAX|ROUND|ROUNDDOWN|ROUNDUP|IF)$/.test(w) ? w : label(w))).replace(/\*/g, '×').replace(/\//g, '÷')}</div>)}
                {!(d.definition?.lines || []).length && <span className="text-[#6f6f6f] font-sans text-[14px]">Written as code; open it to read</span>}
              </div>
            </div>
          ))}
          {!q('amount').length && <button className="mt-3 text-[14px] text-[#0f62fe]" onClick={() => onTab('amount')}>Add a calculation</button>}
        </section>

        <section className="mt-10">
          <H2 n={3}>WHICH ONE</H2>
          {q('choose').map(d => (
            <div key={d.id} className="mt-4">
              <div className="flex items-baseline gap-4 flex-wrap mb-3"><Chip item={{ kind: 'strategy', id: d.id, name: d.name, href: `/p/${projectId}/flows/${d.id}` }} /><State d={d} /><Checks t={d.tests} /></div>
              <StrategySteps graph={d.graph} label={label} ruleChip={bySlug}
                run={sim?.kind === 'strategy' && sim.decisionId === d.id && sim.draft ? { start: (sim.draft.picked || 0) + (sim.draft.dropped || 0), picked: sim.draft.picked, used: sim.draft.allocation?.used } : null} />
              {sim?.kind === 'strategy' && sim.decisionId === d.id && <div className="mt-3 text-[13px] text-[#6f6f6f]">Counts from the last try on {sim.dataset || 'real data'} · <button className="text-[#0f62fe]" onClick={() => onTab('simulate')}>try again</button></div>}
            </div>
          ))}
          {!q('choose').length && <button className="mt-3 text-[14px] text-[#0f62fe]" onClick={() => onTab('choose')}>Add a strategy</button>}
        </section>
      </article>

      <aside className="flex flex-col gap-5 text-[14px] xl:border-l xl:border-[#e2ddd2] xl:pl-7">
        <div>
          <div className="text-[12px] text-[#6f6f6f] mb-2">Next</div>
          {failing.length ? <div className="text-[#da1e28]">Fix the examples that fail in {failing.map(d => d.name).join(', ')}</div>
            : pending ? <div>{pending} change{pending === 1 ? '' : 's'} waiting for approval</div>
            : drafts ? <><div className="mb-3">{drafts} draft{drafts === 1 ? '' : 's'} not live yet</div><button className="h-11 w-full bg-[#161616] text-white text-[15px]" onClick={() => onTab('simulate')}>Try on real data</button></>
            : <div>Everything is live</div>}
        </div>
        <div className="border-t border-[#e2ddd2] pt-4"><div className="text-[12px] text-[#6f6f6f] mb-2">Checked</div>{ds.reduce((a, d) => a + d.tests.total, 0)} examples · {ds.reduce((a, d) => a + d.tests.pass, 0)} pass{sim && <div className="mt-1">Last tried {sim.dataset ? `on ${sim.dataset}` : ''}</div>}</div>
        <div className="border-t border-[#e2ddd2] pt-4"><div className="text-[12px] text-[#6f6f6f] mb-2">Feeds</div>{feeds?.length ? <div className="flex flex-wrap gap-1.5">{feeds.map(f => <Chip key={f.id} item={f} />)}</div> : <span className="text-[#6f6f6f]">No system calls this topic yet</span>}</div>
      </aside>
    </div>
  );
}
