'use client';
// A strategy as step cards for business people: start → who qualifies → score → rank → fund, with counts flowing
// along the line when a run is known. Developers see the same flow on the canvas.
import { Chip, type LinkItem } from '@/components/links/Links';

type Step = { id: string; type: string; data: any };
const ORDER = ['items', 'screen', 'score', 'rank', 'pick'];
const STYLE: Record<string, { bar: string; tint: string; ink: string; label: string }> = {
  items: { bar: '#5b6676', tint: '#eef1f6', ink: '#3b4656', label: 'START WITH' },
  screen: { bar: '#198038', tint: '#e3f5e8', ink: '#198038', label: 'WHO QUALIFIES' },
  score: { bar: '#2b3a8f', tint: '#eef1ff', ink: '#2b3a8f', label: 'SCORE' },
  rank: { bar: '#8a3ffc', tint: '#f1e8ff', ink: '#8a3ffc', label: 'RANK' },
  pick: { bar: '#0f62fe', tint: '#e5efff', ink: '#0f62fe', label: 'FUND' },
};

function orderSteps(graph: any): Step[] {
  const nodes: any[] = graph?.nodes || []; const edges: any[] = graph?.edges || [];
  const byId = new Map(nodes.map(n => [n.id, n]));
  const start = nodes.find(n => n.type === 'input' || n.type === 'apiInput');
  const out: Step[] = []; const seen = new Set<string>();
  let cur = start;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (ORDER.includes(cur.type)) out.push(cur);
    const e = edges.find(x => x.source === cur.id); cur = e && byId.get(e.target);
  }
  return out.length ? out : nodes.filter(n => ORDER.includes(n.type));
}

const fmt = (n: any) => (n == null || isNaN(Number(n)) ? '' : Number(n).toLocaleString('en-US'));

export function StrategySteps({ graph, label, run, ruleChip, onPick, picked }: {
  onPick?: (id: string) => void; picked?: string | null;
  graph: any; label: (p: string) => string; run?: { start?: number; kept?: number; picked?: number; used?: number; budget?: number } | null;
  ruleChip?: (slug: string) => LinkItem | null;
}) {
  const steps = orderSteps(graph);
  if (!steps.length) return <div className="text-[14px] text-[#525252]">This strategy has no steps yet</div>;
  const count = (t: string) => t === 'items' ? run?.start : t === 'screen' ? run?.kept : t === 'pick' ? run?.picked : undefined;
  return (
    <div className="flex flex-wrap items-stretch gap-y-4">
      {steps.map((s, i) => {
        const st = STYLE[s.type]; const d = s.data || {}; const c = count(s.type);
        return (
          <div key={s.id} className="flex items-stretch">
            <div onClick={onPick ? () => onPick(s.id) : undefined} className={`w-[230px] bg-white rounded-[12px] overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,.06),0_6px_18px_rgba(16,24,40,.07)] flex flex-col ${onPick ? 'cursor-pointer hover:-translate-y-0.5 transition-transform' : ''}`} style={{ ...(s.type === 'pick' ? { background: '#0f62fe', color: '#fff' } : {}), ...(picked === s.id ? { boxShadow: '0 0 0 3px #161616, 0 10px 24px rgba(16,24,40,.15)' } : {}) }}>
              <div className="h-1.5" style={{ background: s.type === 'pick' ? 'rgba(255,255,255,.35)' : st.bar }} />
              <div className="px-4 py-3.5 flex flex-col gap-2 flex-1">
                <div className="text-[11px] font-semibold tracking-[.5px]" style={{ color: s.type === 'pick' ? 'rgba(255,255,255,.85)' : st.ink }}>{i + 1} · {st.label}</div>
                <div className="text-[15px] leading-[21px] font-medium">
                  {s.type === 'items' && <>{d.dataset ? `Every row of ${d.dataset}` : `Every item in ${label(String(d.from || 'input.items').replace(/^input\./, ''))}`}</>}
                  {s.type === 'screen' && <>{d.ruleSlug && ruleChip?.(d.ruleSlug) ? <Chip item={ruleChip(d.ruleSlug)!} /> : <>{d.label || 'Keep those that pass'}</>}{d.reason && <div className="text-[12px] font-normal text-[#525252] mt-1">{d.reason}</div>}</>}
                  {s.type === 'score' && <>{label(d.outputAs || 'score')} = {d.expression ? String(d.expression).replace(/\*/g, '×') : d.ruleSlug}</>}
                  {s.type === 'rank' && <>{(d.weights || []).filter((w: any) => w.term).map((w: any) => `${w.weight} × ${label(w.term)}`).join(' + ') || 'Not set'}</>}
                  {s.type === 'pick' && <>{d.mode === 'budget' ? `Until ${label(String(d.budget || 'budget'))} is used` : `Top ${d.n || 1}`}</>}
                </div>
                {c != null && <div className="mt-auto pt-1 text-[24px] font-semibold tabular-nums leading-none">{fmt(c)}{s.type === 'pick' && run?.used != null && <span className="text-[13px] font-normal opacity-85 ml-2">{fmt(run.used)} used</span>}</div>}
              </div>
            </div>
            {i < steps.length - 1 && <div className="w-8 self-center flex items-center"><div className="h-[3px] w-full bg-[#0f62fe] opacity-60" /></div>}
          </div>
        );
      })}
    </div>
  );
}
