'use client';
// Text input that shows numbers with thousands separators (15,000) and the raw value while typing.
import { useState } from 'react';

const isNum = (v: any) => v !== '' && v !== null && v !== undefined && /^-?\d+(\.\d+)?$/.test(String(v).trim());
export const fmtNum = (v: any) => (isNum(v) ? Number(v).toLocaleString('en-US', { maximumFractionDigits: 6 }) : String(v ?? ''));

export function FmtInput({ value, onChange, className, size, ...rest }: { value: any; onChange: (v: string) => void; className?: string; size?: number } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'>) {
  const [focus, setFocus] = useState(false);
  const shown = focus ? String(value ?? '') : fmtNum(value);
  return (
    <input {...rest} className={className} value={shown} size={size ?? Math.max(4, shown.length + 1)}
      onFocus={e => { setFocus(true); rest.onFocus?.(e); }} onBlur={e => { setFocus(false); rest.onBlur?.(e); }}
      onChange={e => onChange(e.target.value.replace(/,/g, '').replace(/^\s+/, ''))} />
  );
}
