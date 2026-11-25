// Read a decision-table row back as an English sentence (for review diffs and explanations).
import { parseCellExpression } from '../rule/operators';

const OP: Record<string, string> = { '=': 'is', '!=': 'is not', '<': 'is less than', '<=': 'is at most', '>': 'is more than', '>=': 'is at least', 'IN': 'is one of', '!IN': 'is not one of', 'NULL': 'is empty', '!NULL': 'is not empty' };
const num = (v: any) => (v !== '' && v !== null && v !== undefined && /^-?\d+(\.\d+)?$/.test(String(v).trim()) ? Number(v).toLocaleString('en-US') : String(v ?? ''));

export function rowSentence(def: any, row: any, label: (p: string) => string, last: boolean): string {
  const ins: any[] = def?.inputs || []; const outs: any[] = def?.outputs || [];
  const conds = ins.map((c, i) => {
    const { operator, args } = parseCellExpression(row?.inputs?.[i]);
    if (operator === 'ANY' || operator === 'ELSE') return '';
    if (operator.startsWith('BTW')) return `${label(c.name)} is between ${num(args[0])} and ${num(args[1])}`;
    const o = OP[operator] || operator;
    return `${label(c.name)} ${o}${args.length && args[0] !== '' ? ' ' + num(args[0]) : ''}`;
  }).filter(Boolean);
  const res = outs.map((o, i) => `${label(o.name)} = ${num(row?.outputs?.[i])}`).join(', ');
  return conds.length ? `If ${conds.join(' and ')} then ${res}` : `${last ? 'Otherwise' : 'Always'} ${res}`;
}

export function tableSentences(def: any, label: (p: string) => string): string[] {
  const rules: any[] = def?.rules || [];
  return rules.map((r, i) => rowSentence(def, r, label, i === rules.length - 1));
}
