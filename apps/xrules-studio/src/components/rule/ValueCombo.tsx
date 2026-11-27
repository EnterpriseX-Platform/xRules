'use client';
// A value box that takes any typed value and offers the word's known values as you type ("Use 'Y'" when it is new).
import { useRef, useState } from 'react';

export function ValueCombo({ value, values, onChange, className = '', ariaLabel, placeholder = 'value' }: {
  value: string; values: string[]; onChange: (v: string) => void; className?: string; ariaLabel?: string; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState<string | null>(null);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const text = q ?? String(value ?? '');
  const t = text.trim();
  const shown = values.filter(v => !t || q == null || v.toLowerCase().includes(t.toLowerCase())).slice(0, 30);
  const known = values.some(v => v === t);
  const items = [...shown.map(v => ({ v, label: v })), ...(t && !known ? [{ v: t, label: `Use "${t}"` }] : [])];
  const pick = (v: string) => { onChange(v); setQ(null); setOpen(false); };
  return (
    <span className="relative inline-block">
      <input ref={ref} aria-label={ariaLabel} placeholder={placeholder} className={className} value={text} role="combobox" aria-expanded={open} autoComplete="off"
        onFocus={() => { setOpen(true); setHi(0); }}
        onChange={e => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onBlur={() => setTimeout(() => { setOpen(false); if (q != null) { if (q.trim() !== String(value ?? '')) onChange(q.trim()); setQ(null); } }, 120)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, items.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); const it = items[hi] || (t ? { v: t } : null); if (it) pick(it.v); ref.current?.blur(); }
          else if (e.key === 'Escape') { setQ(null); setOpen(false); }
        }} />
      {open && items.length > 0 && (
        <span role="listbox" className="absolute left-0 top-full z-20 mt-px min-w-full w-max max-w-[320px] max-h-[260px] overflow-auto bg-white shadow-[0_2px_6px_rgba(0,0,0,.3)] text-[14px] text-[#161616] leading-normal">
          {items.map((it, i) => (
            <button key={it.label} type="button" role="option" aria-selected={i === hi} onMouseDown={e => e.preventDefault()} onClick={() => pick(it.v)}
              className={`block w-full text-left px-3 h-9 truncate ${i === hi ? 'bg-[#e8e8e8]' : 'hover:bg-[#e8e8e8]'} ${it.label.startsWith('Use "') ? 'text-[#0f62fe] border-t border-[#e0e0e0]' : ''}`}>{it.label}</button>
          ))}
        </span>
      )}
    </span>
  );
}
