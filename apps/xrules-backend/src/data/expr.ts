// Compile an expression once and call it many times (per row) inside one vm context.
// Variables available: row fields directly (unitPrice), `row`, plus anything in `extra`.
import { Script, createContext } from 'node:vm';

export function compile(expr: string): (row: Record<string, any>, extra?: Record<string, any>) => any {
  const ctx = createContext({ Math, Date, JSON, Number, String, Boolean, Array, Object, isNaN, parseFloat, parseInt });
  const fn = new Script(`(function(__s){ with(__s){ return (${expr}); } })`, { filename: 'data-expr.js' }).runInContext(ctx, { timeout: 1000 });
  return (row, extra) => fn({ ...(extra || {}), ...row, row });
}

export function keyOf(row: Record<string, any>, fields: string[]): string {
  return fields.map(f => {
    const v = row[f] ?? row[f.toUpperCase()] ?? row[f.toLowerCase()];
    return v === undefined || v === null ? '' : String(v).trim();
  }).join('|');
}
