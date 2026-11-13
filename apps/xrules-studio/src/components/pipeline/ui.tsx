'use client';
// Small Carbon g10 building blocks for the Data Layer pages.
export function PageHead({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 mb-6">
      <div className="flex-1 min-w-[min(100%,360px)]">
        <h1 className="text-[28px] leading-9 font-normal text-[#161616]">{title}</h1>
        {sub && <div className="text-[14px] text-[#525252] mt-1">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
export function Tag({ tone = 'gray', children }: { tone?: 'gray' | 'green' | 'red' | 'blue' | 'orange'; children: React.ReactNode }) {
  const c = { gray: 'bg-[#e0e0e0] text-[#161616]', green: 'bg-[#a7f0ba] text-[#0e6027]', red: 'bg-[#ffd7d9] text-[#a2191f]', blue: 'bg-[#d0e2ff] text-[#0043ce]', orange: 'bg-[#ffd8bd] text-[#8a3800]' }[tone];
  return <span className={`inline-flex items-center h-6 px-2 rounded-full text-[12px] whitespace-nowrap ${c}`}>{children}</span>;
}
export function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: React.ReactNode }) {
  return (
    <div className="bg-white overflow-x-auto">
      <table className="w-full text-[14px] tabular-nums">
        <thead><tr className="bg-[#e0e0e0]">{head.map(h => <th key={h} className="text-left font-semibold px-4 h-12 whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  );
}
export const Td = ({ children, mono, className = '' }: any) => <td className={`px-4 h-12 border-b border-[#e0e0e0] whitespace-nowrap ${mono ? 'font-mono text-[13px]' : ''} ${className}`}>{children}</td>;
export function Btn({ kind = 'primary', children, ...p }: any) {
  const c = { primary: 'bg-[#0f62fe] text-white hover:bg-[#0353e9]', secondary: 'bg-[#393939] text-white hover:bg-[#474747]', tertiary: 'border border-[#0f62fe] text-[#0f62fe] hover:bg-[#0f62fe] hover:text-white', ghost: 'text-[#0f62fe] hover:bg-[#e8e8e8]' }[kind as string];
  return <button {...p} className={`h-10 pl-4 pr-8 text-[14px] disabled:opacity-40 flex items-center gap-2 ${c} ${p.className || ''}`}>{children}</button>;
}
export const fmtTime = (s?: string | null) => s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/** "0 23 * * *" → "Daily 23:00" for the common shapes; anything else stays as cron. */
export function cronText(cron?: string | null): string {
  if (!cron) return 'Manual';
  const f = cron.trim().split(/\s+/);
  if (f.length !== 5 || !/^\d+$/.test(f[0]) || !/^\d+$/.test(f[1])) return cron;
  const t = `${f[1].padStart(2, '0')}:${f[0].padStart(2, '0')}`;
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (f[2] === '*' && f[3] === '*' && f[4] === '*') return `Daily ${t}`;
  if (f[2] === '*' && f[3] === '*' && /^[0-6]$/.test(f[4])) return `Every ${days[+f[4]]} ${t}`;
  if (/^\d+$/.test(f[2]) && f[3] === '*' && f[4] === '*') return `Monthly on day ${f[2]} ${t}`;
  return cron;
}

export function Tabs({ tabs, value, onChange }: { tabs: string[]; value: string; onChange: (t: string) => void }) {
  return (
    <div className="flex border-b border-[#e0e0e0] mb-4">
      {tabs.map(t => <button key={t} onClick={() => onChange(t)} className={`h-10 px-4 text-[14px] ${value === t ? 'border-b-2 border-[#0f62fe] text-[#161616] font-semibold' : 'text-[#525252] hover:bg-[#e8e8e8]'}`}>{t}</button>)}
    </div>
  );
}
export function Input({ label, id, value, onChange, mono, placeholder, type = 'text', className = '' }: any) {
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="block text-[12px] text-[#525252] mb-1.5">{label}</label>}
      <input id={id} type={type} className={`input w-full ${mono ? 'font-mono text-[13px]' : ''}`} value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
export function TextArea({ label, id, value, onChange, rows = 6, mono = true }: any) {
  return (
    <div>
      {label && <label htmlFor={id} className="block text-[12px] text-[#525252] mb-1.5">{label}</label>}
      <textarea id={id} rows={rows} className={`w-full bg-[#f4f4f4] border-b border-[#8d8d8d] px-3 py-2 text-[13px] ${mono ? 'font-mono' : ''} focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2`} value={value ?? ''} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
export function Panel({ title, actions, children, className = '' }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white ${className}`}>
      {(title || actions) && <div className="h-12 px-4 flex items-center justify-between border-b border-[#e0e0e0]"><div className="text-[16px]">{title}</div><div className="flex gap-2">{actions}</div></div>}
      <div className="p-4">{children}</div>
    </div>
  );
}
export function Notice({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success' | 'warning'; children: React.ReactNode }) {
  const c = { info: ['#edf5ff', '#0043ce'], error: ['#fff1f1', '#da1e28'], success: ['#defbe6', '#24a148'], warning: ['#fcf4d6', '#f1c21b'] }[kind];
  return <div className="px-4 py-3 text-[14px] border-l-[3px]" style={{ background: c[0], borderColor: c[1] }}>{children}</div>;
}
export function DropZone({ onFile, label = 'Drop a file here or click to choose', accept }: { onFile: (f: File) => void; label?: string; accept?: string }) {
  const id = `dz-${Math.random().toString(36).slice(2)}`;
  return (
    <label htmlFor={id} className="block border border-dashed border-[#8d8d8d] bg-[#f4f4f4] px-4 py-6 text-center text-[14px] text-[#525252] cursor-pointer hover:bg-[#e8e8e8]"
      onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}>
      {label}
      <input id={id} type="file" accept={accept} className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </label>
  );
}
export const fileToBase64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(f); });
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
