'use client';
// The project's vocabulary: business names for data fields, used wherever a field is shown.
import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type Term = { id: string; term: string; path: string; type: string; values: string[]; unit?: string | null; description?: string | null };

export function useTerms(projectId?: string, ensure?: { path: string; type?: string }[]) {
  const qc = useQueryClient();
  const key = ['vocab', projectId];
  const { data: terms = [] } = useQuery({ queryKey: key, queryFn: () => api.get<Term[]>(`/platform/vocabulary?project_id=${projectId}`), enabled: !!projectId && !projectId.startsWith('_') });
  // fields used by a rule but missing from the vocabulary get a temporary term (the field name)
  const asked = useRef('');
  const missing = (ensure || []).filter(f => f.path && !terms.some(t => t.path === f.path));
  const sig = missing.map(f => f.path).sort().join('|');
  useEffect(() => {
    if (!projectId || projectId.startsWith('_') || !sig || asked.current === sig) return;
    asked.current = sig;
    api.post<Term[]>('/platform/vocabulary/ensure', { projectId, fields: missing }).then(list => qc.setQueryData(key, list)).catch(() => {});
  }, [projectId, sig]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    const byPath = new Map(terms.map(t => [t.path, t]));
    const label = (path: string) => {
      if (byPath.has(path)) return byPath.get(path)!.term;
      // a.b.c → label of the last known prefix + rest (flow outputs like loan.limit)
      const parts = path.split('.');
      for (let i = parts.length - 1; i > 0; i--) { const tail = parts.slice(i).join('.'); if (byPath.has(tail)) return byPath.get(tail)!.term; }
      return plainName(path);
    };
    return { terms, byPath, label, term: (path: string) => byPath.get(path) || byPath.get(path.split('.').pop() || '') };
  }, [terms]);
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
