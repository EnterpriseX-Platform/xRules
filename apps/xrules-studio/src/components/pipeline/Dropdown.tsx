'use client';
// Carbon-style dropdown (no native <select>).
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface Option { value: string; label: string; hint?: string }

export function Dropdown({ id, value, options, onChange, placeholder = 'Select' }: {
  id?: string; value?: string; options: Option[]; onChange: (v: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as any)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const cur = options.find(o => o.value === value);
  return (
    <div className="relative" ref={ref}>
      <button id={id} type="button" onClick={() => setOpen(o => !o)}
        className="w-full h-10 px-3 flex items-center justify-between bg-[#f4f4f4] border-b border-[#8d8d8d] text-[14px] text-left focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2">
        <span className={cur ? 'text-[#161616] truncate' : 'text-[#6f6f6f]'}>{cur?.label || value || placeholder}</span>
        <ChevronDown className={`h-4 w-4 text-[#161616] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-40 left-0 right-0 bg-white border border-[#e0e0e0] max-h-64 overflow-y-auto shadow-[0_2px_6px_rgba(0,0,0,.2)]">
          {options.length === 0 && <div className="px-3 py-2 text-[13px] text-[#6f6f6f]">Nothing here</div>}
          {options.map(o => (
            <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
              className="w-full px-3 h-10 flex items-center justify-between text-left text-[14px] hover:bg-[#e8e8e8]">
              <span className="truncate">{o.label}{o.hint && <span className="ml-2 text-[12px] text-[#6f6f6f]">{o.hint}</span>}</span>
              {o.value === value && <Check className="h-4 w-4 text-[#0f62fe]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
