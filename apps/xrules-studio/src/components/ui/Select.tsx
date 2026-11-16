'use client';
// Drop-in replacement for a native <select> (product rule: no native selects anywhere).
// Same props as <select>: value, onChange(e) with e.target.value, className, disabled, and <option> children —
// rendered as the system's Carbon dropdown. The list opens in a portal so table cells and scroll areas don't clip it.
import { Children, isValidElement, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

type Opt = { value: string; label: string; disabled?: boolean };

const text = (n: ReactNode): string =>
  n == null || typeof n === 'boolean' ? '' : typeof n === 'string' || typeof n === 'number' ? String(n)
    : Array.isArray(n) ? n.map(text).join('') : isValidElement(n) ? text((n.props as any).children) : '';

function optionsOf(children: ReactNode): Opt[] {
  const out: Opt[] = [];
  Children.toArray(children).forEach((c: any) => {
    if (!isValidElement(c)) return;
    const p: any = c.props;
    if (c.type === 'option') {
      const label = text(p.children);
      out.push({ value: p.value !== undefined ? String(p.value) : label, label, disabled: p.disabled });
    } else if (p?.children) out.push(...optionsOf(p.children));   // fragments / optgroup
  });
  return out;
}

export function Select({ value, onChange, className = '', disabled, children, id, 'aria-label': ariaLabel, title }: {
  value?: string | number; onChange?: (e: { target: { value: string } }) => void; className?: string; disabled?: boolean;
  children?: ReactNode; id?: string; 'aria-label'?: string; title?: string;
}) {
  const opts = optionsOf(children);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const cur = opts.find(o => o.value === String(value ?? '')) ?? opts.find(o => o.value === '' && value == null);
  const compact = /\bh-(6|7|8)\b|text-(xs|\[1[01]px\])/.test(className);

  useLayoutEffect(() => { if (open && btn.current) setRect(btn.current.getBoundingClientRect()); }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!btn.current?.contains(e.target as any) && !list.current?.contains(e.target as any)) setOpen(false); };
    const move = (e: Event) => { if (!list.current?.contains(e.target as any)) setOpen(false); };
    document.addEventListener('mousedown', close); window.addEventListener('scroll', move, true); window.addEventListener('resize', move);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('scroll', move, true); window.removeEventListener('resize', move); };
  }, [open]);

  const pick = (o: Opt) => { if (o.disabled) return; setOpen(false); if (o.value !== String(value ?? '')) onChange?.({ target: { value: o.value } }); };
  const width = className.match(/\bw-(\d+|full|\[[^\]]+\])/) ? '' : 'w-full';
  const below = rect ? window.innerHeight - rect.bottom > 260 : true;

  return (
    <>
      <button ref={btn} id={id} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} title={title}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false); if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}
        className={`${width} ${className.replace(/\binput\b/, '')} inline-flex items-center justify-between gap-1 bg-[#f4f4f4] border-b border-[#8d8d8d] text-left ${compact ? 'h-8 px-2 text-[12px]' : 'h-10 px-3 text-[14px]'} disabled:opacity-50 focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2`}>
        <span className={`truncate ${cur && cur.value !== '' ? 'text-[#161616]' : 'text-[#6f6f6f]'}`}>{cur?.label ?? String(value ?? '')}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && rect && createPortal(
        <div ref={list} role="listbox" className="fixed z-[1000] bg-white border border-[#e0e0e0] shadow-[0_2px_6px_rgba(0,0,0,.2)] max-h-64 overflow-y-auto"
          style={{ left: rect.left, minWidth: Math.max(rect.width, 160), ...(below ? { top: rect.bottom } : { bottom: window.innerHeight - rect.top }) }}>
          {opts.map(o => (
            <button key={o.value + o.label} type="button" role="option" aria-selected={o.value === String(value ?? '')} disabled={o.disabled} onClick={() => pick(o)}
              className={`w-full flex items-center justify-between gap-3 text-left hover:bg-[#e8e8e8] disabled:text-[#c6c6c6] ${compact ? 'h-8 px-2 text-[12px]' : 'h-10 px-3 text-[14px]'}`}>
              <span className="truncate">{o.label}</span>
              {o.value === String(value ?? '') && <Check className="h-4 w-4 text-[#0f62fe] shrink-0" />}
            </button>
          ))}
        </div>, document.body)}
    </>
  );
}
