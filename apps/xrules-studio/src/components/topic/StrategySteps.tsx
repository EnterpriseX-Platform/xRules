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
  const CAPTION: Record<string, string> = { items: 'Start with', screen: 'Keep', score: 'Score', rank: 'Rank by', pick: 'Fund' };
  return (
    <ol className="m-0 p-0 list-none bg-white border border-[#e0e0e0]">
      {steps.map((s, i) => {
        const d = s.data || {}; const c = count(s.type);
        return (
          <li key={s.id} onClick={onPick ? () => onPick(s.id) : undefined}
            className={`grid grid-cols-[48px_minmax(0,1fr)_160px] items-center min-h-[64px] border-t border-[#e0e0e0] first:border-t-0 ${onPick ? 'cursor-pointer hover:bg-[#e8e8e8]' : ''} ${picked === s.id ? 'bg-[#e0e0e0]' : ''}`}>
            <span className="self-stretch flex items-center justify-center text-[14px] text-[#525252] border-r border-[#e0e0e0]">{i + 1}</span>
            <div className="px-4 py-3 min-w-0">
              <div className="text-[12px] text-[#525252]">{CAPTION[s.type]}</div>
              <div className="text-[15px] leading-[22px] text-[#161616] mt-0.5">
                {s.type === 'items' && <>{d.dataset ? `Every row of ${d.dataset}` : `Every item in ${label(String(d.from || 'input.items').replace(/^input\./, ''))}`}</>}
                {s.type === 'screen' && <>{d.ruleSlug && ruleChip?.(d.ruleSlug) ? <>Those that pass <Chip item={ruleChip(d.ruleSlug)!} /></> : <>{d.label || 'Those that pass'}</>}{d.reason && <span className="text-[13px] text-[#525252]"> · {d.reason}</span>}</>}
                {s.type === 'score' && <>{label(d.outputAs || 'score')} = {d.expression ? String(d.expression).replace(/[A-Za-z_][\w]*/g, (w: string) => label(w)).replace(/\*/g, '×') : d.ruleSlug}</>}
                {s.type === 'rank' && <>{(d.weights || []).filter((w: any) => w.term).map((w: any) => `${w.weight} × ${label(w.term)}`).join(' + ') || 'Not set'}</>}
                {s.type === 'pick' && <>{d.mode === 'budget' ? `Down the ranking until ${label(String(d.budget || 'budget'))} is used` : `The top ${d.n || 1}`}</>}
              </div>
            </div>
            <div className="px-4 text-right tabular-nums">
              {c != null && <><span className="text-[20px] text-[#161616]">{fmt(c)}</span>{s.type === 'pick' && run?.used != null && <div className="text-[12px] text-[#525252]">{fmt(run.used)} used</div>}</>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
