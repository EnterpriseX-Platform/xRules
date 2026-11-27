'use client';
// A checkbox whose tick is always the real selection: it is controlled by `checked`, a click sets (not toggles) the
// value, and a change made from outside a click (autofill, a script setting .checked and firing change/input)
// reaches the same handler, so what is shown and what is selected never disagree.
import { useEffect, useRef } from 'react';

export function Tick({ checked, onSet, indeterminate, className = 'h-4 w-4 accent-[#161616]', ...rest }:
  { checked: boolean; onSet: (on: boolean) => void; indeterminate?: boolean; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'checked' | 'onChange' | 'type'>) {
  const ref = useRef<HTMLInputElement>(null);
  const live = useRef({ checked, onSet }); live.current = { checked, onSet };
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const sync = () => { if (el.checked !== live.current.checked) live.current.onSet(el.checked); };
    el.addEventListener('change', sync); el.addEventListener('input', sync);
    return () => { el.removeEventListener('change', sync); el.removeEventListener('input', sync); };
  }, []);
  useEffect(() => { if (ref.current) { ref.current.checked = checked; ref.current.indeterminate = !!indeterminate; } }, [checked, indeterminate]);
  return <input ref={ref} type="checkbox" className={className} checked={checked} onChange={e => onSet(e.target.checked)} {...rest} />;
}
