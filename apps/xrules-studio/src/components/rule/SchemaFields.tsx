'use client';
// Fields of a flat JSON Schema object as rows: name · type · required.
import { Plus, Trash2 } from 'lucide-react';
import { Dropdown } from '@/components/pipeline/Dropdown';

export type SField = { name: string; type: string; required: boolean; extra?: any };
const TYPES = ['string', 'number', 'integer', 'boolean', 'object', 'array'].map(t => ({ value: t, label: t }));

export function toFields(schema: any): SField[] {
  const props = schema?.properties || {};
  const req: string[] = schema?.required || [];
  return Object.entries(props).map(([name, p]: any) => {
    const { type, ...extra } = p || {};
    return { name, type: Array.isArray(type) ? type[0] : type || 'string', required: req.includes(name), extra };
  });
}
export function toSchema(fields: SField[], base: any) {
  const properties: any = {};
  for (const f of fields) if (f.name.trim()) properties[f.name.trim()] = { ...(f.extra || {}), type: f.type };
  const required = fields.filter(f => f.required && f.name.trim()).map(f => f.name.trim());
  const out: any = { ...(base || {}), type: 'object', properties };
  if (required.length) out.required = required; else delete out.required;
  return out;
}

export function SchemaFields({ fields, onChange }: { fields: SField[]; onChange: (f: SField[]) => void }) {
  const upd = (i: number, p: Partial<SField>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...p } : f)));
  return (
    <div>
      <div className="grid grid-cols-[1fr_120px_72px_32px] gap-2 px-4 h-9 items-center text-[12px] text-[#525252] border-b border-[#e0e0e0]">
        <span>Field</span><span>Type</span><span>Required</span><span />
      </div>
      {fields.map((f, i) => (
        <div key={i} className="grid grid-cols-[1fr_120px_72px_32px] gap-2 px-4 py-1.5 items-center border-b border-[#f4f4f4]">
          <input className="input w-full font-mono text-[13px] min-w-0" value={f.name} placeholder="amount" aria-label="Field name"
            onChange={e => upd(i, { name: e.target.value.replace(/[^A-Za-z0-9_]/g, '') })} />
          <Dropdown value={f.type} options={TYPES} onChange={v => upd(i, { type: v })} />
          <button type="button" role="checkbox" aria-checked={f.required} aria-label="Required" onClick={() => upd(i, { required: !f.required })}
            className="h-8 w-8 flex items-center justify-center">
            <span className={`h-4 w-4 border flex items-center justify-center text-[11px] ${f.required ? 'bg-[#161616] border-[#161616] text-white' : 'border-[#8d8d8d]'}`}>{f.required ? '✓' : ''}</span>
          </button>
          <button type="button" className="h-8 w-8 flex items-center justify-center text-[#525252] hover:bg-[#e8e8e8]" aria-label="Remove field"
            onClick={() => onChange(fields.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      <button type="button" className="m-2 h-8 px-2 text-[13px] text-[#0f62fe] hover:bg-[#e8e8e8] flex items-center gap-1"
        onClick={() => onChange([...fields, { name: '', type: 'string', required: false }])}><Plus className="h-4 w-4" /> Add field</button>
    </div>
  );
}
