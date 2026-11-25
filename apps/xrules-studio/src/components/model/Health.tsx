'use client';
// Model health as a traffic light with one plain sentence.
// Classification by AUC (×100): below 52 is no better than chance, 70+ good, 80+ excellent; a drop of more than 20% from the
// previous version is flagged. Regression by R²; clustering by silhouette.
export type Health = { tone: 'red' | 'yellow' | 'green' | 'gray'; text: string };
export function healthOf(h: any): Health {
  if (!h?.metrics) return { tone: 'gray', text: 'Not evaluated yet' };
  const m = h.metrics, p = h.previous || {};
  const pick = (o: any) => o.auc != null ? { k: 'auc', v: o.auc * 100 } : o.r2 != null ? { k: 'r2', v: o.r2 * 100 } : o.silhouette != null ? { k: 'silhouette', v: o.silhouette * 100 } : o.accuracy != null ? { k: 'accuracy', v: o.accuracy * 100 } : null;
  const now = pick(m); if (!now) return { tone: 'gray', text: 'No headline measure' };
  const before = p[now.k] != null ? p[now.k] * 100 : null;
  const pct = Math.round(now.v);
  if (before && before > 0 && (before - now.v) / before > 0.2) return { tone: 'red', text: `Dropped from ${Math.round(before)} to ${pct} since the last version` };
  if (now.k === 'auc' || now.k === 'accuracy') {
    if (now.v < 52) return { tone: 'red', text: `Scores ${pct} of 100, about as good as guessing` };
    if (now.v < 70) return { tone: 'yellow', text: `Scores ${pct} of 100, weak; check the data before relying on it` };
    if (now.v < 80) return { tone: 'green', text: `Scores ${pct} of 100, good` };
    return { tone: 'green', text: `Scores ${pct} of 100, excellent` };
  }
  if (now.k === 'r2') {
    if (now.v < 10) return { tone: 'red', text: `Explains ${Math.max(pct, 0)}% of the differences, not useful yet` };
    if (now.v < 50) return { tone: 'yellow', text: `Explains ${pct}% of the differences, weak` };
    return { tone: 'green', text: `Explains ${pct}% of the differences, good` };
  }
  return now.v < 25 ? { tone: 'yellow', text: `Groups overlap a lot (${pct} of 100)` } : { tone: 'green', text: `Groups are well separated (${pct} of 100)` };
}
const DOT = { red: '#da1e28', yellow: '#f1c21b', green: '#24a148', gray: '#a8a8a8' };
export function HealthLight({ h, size = 'sm' }: { h: Health; size?: 'sm' | 'lg' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${size === 'lg' ? 'text-[15px]' : 'text-[13px]'} text-[#161616]`}>
      <span aria-hidden className="inline-block shrink-0" style={{ width: size === 'lg' ? 14 : 10, height: size === 'lg' ? 14 : 10, borderRadius: 999, background: DOT[h.tone] }} />
      <span>{h.text}</span>
    </span>
  );
}
