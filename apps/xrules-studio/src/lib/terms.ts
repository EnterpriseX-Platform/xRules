'use client';
// The project's vocabulary: business names for data fields, used wherever a field is shown.
import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type Term = { id: string; term: string; path: string; type: string; values: string[]; unit?: string | null; description?: string | null;
  labels?: Record<string, string>; groups?: string[]; valueSet?: { id: string; name: string; columns: string[] } | null; valueSetId?: string | null; aggregate?: any; derived?: boolean };

// ---- value sets: codes are stored, labels shown; groups read "group Prohibited". Read by the value box and the table checks.
const LABELS = new Map<string, string>();
const SET_OF = new Map<string, { codes: string[]; labels: Record<string, string>; groups: string[]; name: string }>();
/** What a stored value reads as: C003 → Retail, GROUP:Prohibited → group Prohibited. */
export function valueLabel(v: string): string {
  const s = String(v ?? '');
  if (/^GROUP:/i.test(s)) return `in group ${s.replace(/^GROUP:\s*/i, '')}`;
  return LABELS.get(s) ?? s;
}
/** The code behind what is typed or picked (a label, "group X", or the code itself). */
export function valueCode(v: string, values?: string[]): string {
  const s = String(v ?? '').trim();
  const g = s.match(/^(?:in\s+)?group\s+(.+)$/i); if (g) return `GROUP:${g[1].trim()}`;
  if (values?.includes(s)) return s;
  for (const [code, label] of Array.from(LABELS.entries())) if (label.toLowerCase() === s.toLowerCase() && (!values || values.includes(code))) return code;
  return s;
}
/** The value set a word (by path) takes its values from. */
export const setOf = (path: string) => SET_OF.get(String(path).replace(/^(any|all):/, ''));

/** A list path read as words: bureau_accounts[].payments[] → payment */
const itemWord = (seg: string) => plainName(seg.replace(/\[\]$/, '')).replace(/ies$/, 'y').replace(/(?<!s)s$/, '');
/** The words a business user picks: each list field also reads "any <item> where <field>" and "every <item> where <field>";
 *  each extra column of a value set reads "<column> of <word>". */
function derive(terms: Term[]): Term[] {
  const out: Term[] = [];
  for (const t of terms) {
    if (t.path.includes('[]') && !t.path.endsWith('[]') && !t.path.startsWith('@')) {
      const i = t.path.lastIndexOf('[]'); const list = t.path.slice(0, i); const item = itemWord(list.split('.').pop() || list);
      out.push({ ...t, id: `any:${t.id}`, path: `any:${t.path}`, term: `any ${item} where ${t.term}`, derived: true });
      out.push({ ...t, id: `all:${t.id}`, path: `all:${t.path}`, term: `every ${item} where ${t.term}`, derived: true });
    }
    for (const c of t.valueSet?.columns || []) out.push({ id: `${t.id}.${c}`, path: `${t.path}.${c}`, term: `${c} of ${t.term}`, type: 'number', values: [], derived: true });
  }
  return out;
}

export function useTerms(projectId?: string, ensure?: { path: string; type?: string }[]) {
  const qc = useQueryClient();
  const key = ['vocab', projectId];
  const { data: raw = [] } = useQuery({ queryKey: key, queryFn: () => api.get<Term[]>(`/platform/vocabulary?project_id=${projectId}`), enabled: !!projectId && !projectId.startsWith('_') });
  // fields used by a rule but missing from the vocabulary get a temporary term (the field name)
  const asked = useRef('');
  const missing = (ensure || []).filter(f => f.path && !/^(any|all):|^@/.test(f.path) && !raw.some(t => t.path === f.path || (t.valueSet?.columns || []).some(c => `${t.path}.${c}` === f.path)));
  const sig = missing.map(f => f.path).sort().join('|');
  useEffect(() => {
    if (!projectId || projectId.startsWith('_') || !sig || asked.current === sig) return;
    asked.current = sig;
    api.post<Term[]>('/platform/vocabulary/ensure', { projectId, fields: missing }).then(list => qc.setQueryData(key, list)).catch(() => {});
  }, [projectId, sig]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    for (const t of raw) if (t.labels) { Object.entries(t.labels).forEach(([c, l]) => LABELS.set(c, l)); SET_OF.set(t.path, { codes: t.values, labels: t.labels, groups: t.groups || [], name: t.valueSet?.name || '' }); }
    const own = raw.filter(t => !String(t.path).endsWith('[]'));
    const terms: Term[] = [...own.map(t => (t.groups?.length ? { ...t, values: [...t.values, ...t.groups.map(g => `GROUP:${g}`)] } : t)), ...derive(own)];
    const byPath = new Map(terms.map(t => [t.path, t]));
    const label = (path: string) => {
      if (byPath.has(path)) return byPath.get(path)!.term;
      // a.b.c → label of the last known prefix + rest (flow outputs like loan.limit)
      const parts = path.split('.');
      for (let i = parts.length - 1; i > 0; i--) { const tail = parts.slice(i).join('.'); if (byPath.has(tail)) return byPath.get(tail)!.term; }
      return plainName(path);
    };
    return { terms, byPath, label, term: (path: string) => byPath.get(path) || byPath.get(path.split('.').pop() || '') };
  }, [raw]);
}

/** A field path read as words, for fields no word names yet: applicant.monthlyIncome → monthly income */
export function plainName(path: string): string {
  const last = String(path || '').split('.').filter(Boolean).pop() || String(path || '');
  const w = last.replace(/\[\d*\]/g, '').replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[_\-]+/g, ' ').trim();
  return w ? (w === w.toUpperCase() && w.length > 4 ? w.toLowerCase() : w.charAt(0).toLowerCase() + w.slice(1)) : path;
}

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });
/** A value as a business user reads it: 15,000 THB */
export function showValue(v: any, t?: Term): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN);
  const s = !isNaN(n) && (t?.type === 'number' || t?.type === 'money' || typeof v === 'number' || !t) ? nf.format(n) : String(v);
  return t?.unit ? `${s} ${t.unit}` : s;
}
