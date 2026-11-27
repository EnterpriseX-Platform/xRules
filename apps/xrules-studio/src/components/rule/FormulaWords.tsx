'use client';
// A calculation line shown in plain words (see lib/formulaWords); numbers can be underlined to click.
import { formulaLines } from '@/lib/formulaWords';

export function FormulaWords({ expr, label, paths, onNumber, className = '' }: {
  expr: string; label: (p: string) => string; paths?: string[]; onNumber?: (value: string, nth: number) => void; className?: string;
}) {
  const lines = formulaLines(expr, label, paths);
  const seen = new Map<string, number>();
  const withNumbers = (text: string) => !onNumber ? text : text.split(/("(?:[^"\\]|\\.)*"|(?<![\w.])-?\d+(?:\.\d+)?(?![\w.]))/).map((p, i) => {
    if (i % 2 === 0 || p.startsWith('"')) return p;
    const n = seen.get(p) || 0; seen.set(p, n + 1);
    return <button key={i} type="button" title="Make it a setting" className="underline underline-offset-[3px] decoration-dotted text-inherit hover:text-[#0f62fe]" onClick={() => onNumber(p, n)}>{p}</button>;
  });
  return <span className={className}>{lines.map((l, i) => <span key={i} className="block" style={{ paddingLeft: `${l.indent * 16}px` }}>{withNumbers(l.text)}</span>)}</span>;
}
