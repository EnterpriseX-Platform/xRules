'use client';
// Settings panel for the selected step.
import { useQuery } from '@tanstack/react-query';
import type { Node } from 'reactflow';
import { Plus, Trash2, X } from 'lucide-react';
import { api, rulesApi } from '@/lib/api';
import { Dropdown } from './Dropdown';
import { metaFor } from './registry';

const csv = (v: any) => (Array.isArray(v) ? v.join(', ') : v || '');
const fromCsv = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);

function Field({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[12px] text-[#525252]">{label}</label>
      {children}
    </div>
  );
}
const Text = ({ id, value, onChange, mono, placeholder }: any) => (
  <input id={id} className={`input w-full ${mono ? 'font-mono text-[13px]' : ''}`} value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
);
const Area = ({ id, value, onChange, rows = 5 }: any) => (
  <textarea id={id} rows={rows} className="w-full bg-[#f4f4f4] border-b border-[#8d8d8d] px-3 py-2 font-mono text-[13px] focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2" value={value ?? ''} onChange={e => onChange(e.target.value)} />
);

export function StepInspector({ node, projectId, onChange, onRemove, onClose }: {
  node: Node; projectId: string; onChange: (id: string, data: any) => void; onRemove: (id: string) => void; onClose: () => void;
}) {
  const m = metaFor(node.type);
  const d = node.data || {};
  const set = (patch: any) => onChange(node.id, { ...d, ...patch });
  const k = node.type;
  const needsConns = k === 'source';
  const needsSets = k === 'join' || k === 'enrich' || k === 'write' || k === 'lookup';
  const { data: conns } = useQuery({ queryKey: ['connections', projectId], queryFn: () => api.get<any[]>(`/connections?project_id=${projectId}`), enabled: needsConns });
  const { data: sets } = useQuery({ queryKey: ['datasets', projectId], queryFn: () => api.get<any[]>(`/datasets?project_id=${projectId}`), enabled: needsSets });
  const { data: rules } = useQuery({ queryKey: ['rules', projectId], queryFn: () => rulesApi.list(projectId), enabled: k === 'ruleCall' || k === 'rulecall' });
  const ruleList: any[] = Array.isArray(rules) ? rules : ((rules as any)?.data || (rules as any)?.items || []);
  const setOpts = (sets || []).map((s: any) => ({ value: s.slug, label: s.slug, hint: s.rowCount ? `${s.rowCount} แถว` : undefined }));

  return (
    <div className="w-[340px] shrink-0 bg-white border-l border-[#e0e0e0] flex flex-col min-h-0">
      <div className="h-14 px-4 flex items-center justify-between border-b border-[#e0e0e0]">
        <div>
          <div className="text-[11px] tracking-[0.06em] text-[#525252]">{m.label}</div>
          <div className="text-[16px] text-[#161616]">{d.label || m.title}</div>
        </div>
        <button className="h-8 w-8 flex items-center justify-center hover:bg-[#e8e8e8]" onClick={onClose} aria-label="ปิด"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <Field label="ชื่อขั้น" htmlFor="st-label"><Text id="st-label" value={d.label} onChange={(v: string) => set({ label: v })} placeholder={m.title} /></Field>

        {k === 'trigger' && <Field label="เริ่มเมื่อ"><Dropdown value={d.type || 'schedule'} onChange={v => set({ type: v })} options={[{ value: 'schedule', label: 'ตามรอบเวลา' }, { value: 'webhook', label: 'มี Webhook เข้ามา' }, { value: 'manual', label: 'กดรันเอง' }]} /></Field>}
        {k === 'trigger' && d.type === 'webhook' && <Field label="รหัสลับของ Webhook (ส่งใน X-Hook-Token)" htmlFor="st-sec"><Text id="st-sec" mono value={d.secret} onChange={(v: string) => set({ secret: v })} /></Field>}
        {k === 'trigger' && <Field label="แจ้งเมื่อล้ม (Webhook URL)" htmlFor="st-nf"><Text id="st-nf" mono value={d.notifyUrl} onChange={(v: string) => set({ notifyUrl: v })} /></Field>}
        {k === 'trigger' && (d.type || 'schedule') === 'schedule' && <>
          <Field label="รอบการรัน (cron)" htmlFor="st-cron"><Text id="st-cron" mono value={d.cron} onChange={(v: string) => set({ cron: v })} placeholder="0 23 * * *" /></Field>
          <Field label="รันเมื่อมีเหตุการณ์" htmlFor="st-ev"><Text id="st-ev" mono value={csv(d.events)} onChange={(v: string) => set({ events: fromCsv(v) })} placeholder="das.published" /></Field>
          <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={d.enabled !== false} onChange={e => set({ enabled: e.target.checked })} /> เปิดใช้รอบอัตโนมัติ</label>
        </>}

        {k === 'source' && <>
          <Field label="Connection"><Dropdown value={d.connection} onChange={v => set({ connection: v })} options={(conns || []).map((c: any) => ({ value: c.slug, label: c.slug, hint: c.type }))} /></Field>
          <Field label="ชนิด"><Dropdown value={d.file ? 'file' : d.path !== undefined ? 'http' : 'sql'} onChange={v => set(v === 'sql' ? { sql: d.sql || 'SELECT ', path: undefined, file: undefined } : v === 'http' ? { path: d.path || '/', sql: undefined, file: undefined } : { file: d.file || { url: '' }, sql: undefined, path: undefined })}
            options={[{ value: 'sql', label: 'SQL query' }, { value: 'http', label: 'REST API' }, { value: 'file', label: 'ไฟล์ Excel / CSV' }]} /></Field>
          {!d.file && d.path === undefined && <Field label="SQL (SELECT เท่านั้น)" htmlFor="st-sql"><Area id="st-sql" rows={8} value={d.sql} onChange={(v: string) => set({ sql: v })} /></Field>}
          {d.path !== undefined && <>
            <Field label="Path" htmlFor="st-path"><Text id="st-path" mono value={d.path} onChange={(v: string) => set({ path: v })} /></Field>
            <Field label="ตำแหน่งรายการใน JSON" htmlFor="st-ip"><Text id="st-ip" mono value={d.itemsPath} onChange={(v: string) => set({ itemsPath: v })} placeholder="data.items" /></Field>
          </>}
          {d.file && <>
            <Field label="URL ไฟล์" htmlFor="st-furl"><Text id="st-furl" mono value={d.file.url} onChange={(v: string) => set({ file: { ...d.file, url: v } })} /></Field>
            <Field label="ชีต" htmlFor="st-sheet"><Text id="st-sheet" value={d.sheet} onChange={(v: string) => set({ sheet: v })} /></Field>
          </>}
        </>}

        {k === 'map' && <KeyValue label="ฟิลด์ปลายทาง = นิพจน์" value={d.fields || {}} onChange={(fields: any) => set({ fields })} keyPh="unitPrice" valPh="Number(unit_price)" />}
        {k === 'map' && <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={!!d.keep} onChange={e => set({ keep: e.target.checked })} /> เก็บคอลัมน์เดิมไว้ด้วย</label>}

        {k === 'filter' && <Field label="เก็บแถวที่" htmlFor="st-fx"><Text id="st-fx" mono value={d.expression} onChange={(v: string) => set({ expression: v })} placeholder="fiscalYear >= 2570" /></Field>}

        {k === 'join' && <>
          <Field label="Data Set"><Dropdown value={d.dataset} onChange={v => set({ dataset: v })} options={setOpts} /></Field>
          <Field label="คีย์ (นิพจน์ คั่นด้วย ,)" htmlFor="st-jk"><Text id="st-jk" mono value={csv(d.key)} onChange={(v: string) => set({ key: fromCsv(v) })} /></Field>
          <Field label="ใส่ผลไว้ที่" htmlFor="st-as"><Text id="st-as" mono value={d.as} onChange={(v: string) => set({ as: v })} /></Field>
        </>}

        {k === 'quality' && <>
          <Checks value={d.checks || []} onChange={(checks: any) => set({ checks })} />
          <Field label="คีย์ที่ห้ามซ้ำ" htmlFor="st-uq"><Text id="st-uq" mono value={csv(d.unique)} onChange={(v: string) => set({ unique: fromCsv(v) })} placeholder="itemCode, fiscalYear" /></Field>
          <Field label="จำนวนแถวขั้นต่ำเทียบรอบก่อน" htmlFor="st-mr"><Text id="st-mr" mono value={d.minRowRatio ?? ''} onChange={(v: string) => set({ minRowRatio: v === '' ? undefined : Number(v) })} placeholder="0.9" /></Field>
        </>}

        {k === 'write' && <>
          <Field label="Data Set (มีอยู่แล้ว หรือพิมพ์ชื่อใหม่)" htmlFor="st-ds"><Text id="st-ds" mono value={d.dataset} onChange={(v: string) => set({ dataset: v })} /></Field>
          <Field label="คีย์ค้นหา" htmlFor="st-kf"><Text id="st-kf" mono value={csv(d.keyFields)} onChange={(v: string) => set({ keyFields: fromCsv(v) })} placeholder="itemCode, fiscalYear" /></Field>
          <Field label="ฟิลด์ข้อมูลส่วนบุคคล (ไม่เก็บ)" htmlFor="st-pii"><Text id="st-pii" mono value={csv(d.piiFields)} onChange={(v: string) => set({ piiFields: fromCsv(v) })} /></Field>
        </>}

        {k === 'notify' && <Field label="Webhook URL" htmlFor="st-nu"><Text id="st-nu" mono value={d.url} onChange={(v: string) => set({ url: v })} /></Field>}

        {k === 'enrich' && <>
          <Field label="Data Set"><Dropdown value={d.dataset} onChange={v => set({ dataset: v })} options={setOpts} /></Field>
          <Field label="ทำกับแต่ละรายการใน" htmlFor="st-fe"><Text id="st-fe" mono value={d.forEach} onChange={(v: string) => set({ forEach: v })} placeholder="input.items" /></Field>
          <Field label="คีย์ (คั่นด้วย ,)" htmlFor="st-ek"><Text id="st-ek" mono value={csv(d.key)} onChange={(v: string) => set({ key: fromCsv(v) })} placeholder="{{item.itemCode}}, {{input.context.fiscalYear}}" /></Field>
          <Field label="ใส่ค่าไว้ที่" htmlFor="st-wt"><Text id="st-wt" mono value={d.writeTo} onChange={(v: string) => set({ writeTo: v })} placeholder="ref.standardPrice" /></Field>
          <Field label="รอได้นานสุด (ms)" htmlFor="st-to"><Text id="st-to" mono value={d.timeoutMs ?? 500} onChange={(v: string) => set({ timeoutMs: Number(v) || 500 })} /></Field>
          <Field label="ถ้าดึงไม่ได้ ให้ข้ามกฎ" htmlFor="st-rc"><Text id="st-rc" mono value={csv(d.ruleCodes)} onChange={(v: string) => set({ ruleCodes: fromCsv(v) })} placeholder="TOR-4.4.1.3" /></Field>
        </>}

        {k === 'filecheck' && <>
          <Field label="รายการไฟล์ใน input" htmlFor="st-ff"><Text id="st-ff" mono value={d.files} onChange={(v: string) => set({ files: v })} placeholder="input.files" /></Field>
          <Field label="รหัสกฎ" htmlFor="st-frc"><Text id="st-frc" mono value={d.ruleCode} onChange={(v: string) => set({ ruleCode: v })} placeholder="TOR-4.4.1.7" /></Field>
        </>}

        {(k === 'ruleCall' || k === 'rulecall') && <>
          <Field label="กฎ"><Dropdown value={d.ruleSlug} onChange={v => set({ ruleSlug: v })} options={ruleList.map((r: any) => ({ value: r.slug, label: r.name || r.slug, hint: r.type }))} /></Field>
          <Field label="รหัสกฎ (ใส่แล้วผลไปรวมใน Findings)" htmlFor="st-rcode"><Text id="st-rcode" mono value={d.ruleCode} onChange={(v: string) => set({ ruleCode: v })} placeholder="TOR-4.4.1.4" /></Field>
          <Field label="ระดับเมื่อไม่ผ่าน"><Dropdown value={d.severity || 'ERROR'} onChange={v => set({ severity: v })} options={[{ value: 'ERROR', label: 'ERROR · ส่งไม่ได้' }, { value: 'WARNING', label: 'WARNING · ส่งได้' }]} /></Field>
          <Field label="เก็บผลไว้ที่" htmlFor="st-oa"><Text id="st-oa" mono value={d.outputAs} onChange={(v: string) => set({ outputAs: v })} /></Field>
        </>}

        {(k === 'apiResponse' || k === 'apiresponse') && <>
          <Field label="Status code" htmlFor="st-sc"><Text id="st-sc" mono value={d.status ?? 200} onChange={(v: string) => set({ status: Number(v) || 200 })} /></Field>
          <Field label="Body (JSON หรือ {{ตัวแปร}})" htmlFor="st-body"><Area id="st-body" rows={8} value={typeof d.body === 'string' ? d.body : JSON.stringify(d.body ?? '', null, 2)} onChange={(v: string) => { try { set({ body: JSON.parse(v) }); } catch { set({ body: v }); } }} /></Field>
        </>}
        {(k === 'callDecisionFlow' || k === 'calldecisionflow') && <>
          <Field label="Decision Flow (slug)" htmlFor="st-df"><Text id="st-df" mono value={d.flow} onChange={(v: string) => set({ flow: v })} placeholder="neb-prescreen" /></Field>
          <Field label="ส่งข้อมูลเข้า" htmlFor="st-im"><Text id="st-im" mono value={typeof d.inputMap === 'string' ? d.inputMap : JSON.stringify(d.inputMap ?? '')} onChange={(v: string) => set({ inputMap: v })} placeholder="{{input.body}}" /></Field>
          <Field label="เก็บผลไว้ที่" htmlFor="st-oa2"><Text id="st-oa2" mono value={d.outputAs} onChange={(v: string) => set({ outputAs: v })} placeholder="decision" /></Field>
        </>}
        {k === 'lookup' && <>
          <Field label="Data Set"><Dropdown value={d.dataset} onChange={v => set({ dataset: v })} options={setOpts} /></Field>
          <Field label="คีย์ (คั่นด้วย ,)" htmlFor="st-lk"><Text id="st-lk" mono value={csv(d.key)} onChange={(v: string) => set({ key: fromCsv(v) })} placeholder="{{input.params.itemCode}}, {{input.query.fiscalYear}}" /></Field>
          <Field label="เก็บผลไว้ที่" htmlFor="st-lo"><Text id="st-lo" mono value={d.outputAs} onChange={(v: string) => set({ outputAs: v })} /></Field>
        </>}

        {k === 'branch' && <Field label="เงื่อนไข" htmlFor="st-cond"><Text id="st-cond" mono value={d.condition} onChange={(v: string) => set({ condition: v })} /></Field>}
        {(k === 'transform' || k === 'assign') && <>
          <Field label="เก็บไว้ที่" htmlFor="st-tt"><Text id="st-tt" mono value={d.target} onChange={(v: string) => set({ target: v })} /></Field>
          <Field label="นิพจน์" htmlFor="st-te"><Text id="st-te" mono value={d.expression} onChange={(v: string) => set({ expression: v })} /></Field>
        </>}
        {k === 'http' && <Field label="URL" htmlFor="st-hu"><Text id="st-hu" mono value={d.url} onChange={(v: string) => set({ url: v })} /></Field>}
      </div>
      {!m.locked && (
        <div className="p-4 border-t border-[#e0e0e0]">
          <button className="h-10 px-4 text-[14px] text-[#da1e28] hover:bg-[#fff1f1] flex items-center gap-2" onClick={() => onRemove(node.id)}>
            <Trash2 className="h-4 w-4" /> ลบขั้นนี้
          </button>
        </div>
      )}
    </div>
  );
}

function KeyValue({ label, value, onChange, keyPh, valPh }: any) {
  const rows: [string, string][] = Object.entries(value || {}) as any;
  const update = (i: number, k: string, v: string) => { const r = [...rows]; r[i] = [k, v]; onChange(Object.fromEntries(r)); };
  return (
    <div className="space-y-1.5">
      <div className="text-[12px] text-[#525252]">{label}</div>
      {rows.map(([k, v], i) => (
        <div key={i} className="flex gap-1">
          <input className="input w-[38%] font-mono text-[12px]" value={k} placeholder={keyPh} onChange={e => update(i, e.target.value, v)} />
          <input className="input flex-1 font-mono text-[12px]" value={v} placeholder={valPh} onChange={e => update(i, k, e.target.value)} />
          <button className="w-8 hover:bg-[#e8e8e8] flex items-center justify-center" onClick={() => onChange(Object.fromEntries(rows.filter((_, j) => j !== i)))} aria-label="ลบ"><X className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      <button className="h-8 px-2 text-[14px] text-[#0f62fe] hover:bg-[#e8e8e8] flex items-center gap-1" onClick={() => onChange({ ...value, [`field${rows.length + 1}`]: '' })}><Plus className="h-4 w-4" /> เพิ่มฟิลด์</button>
    </div>
  );
}

function Checks({ value, onChange }: { value: any[]; onChange: (v: any[]) => void }) {
  const upd = (i: number, p: any) => onChange(value.map((c, j) => (j === i ? { ...c, ...p } : c)));
  return (
    <div className="space-y-2">
      <div className="text-[12px] text-[#525252]">เงื่อนไขที่ทุกแถวต้องผ่าน</div>
      {value.map((c, i) => (
        <div key={i} className="bg-[#f4f4f4] p-2 space-y-1.5">
          <input className="input w-full font-mono text-[12px] !bg-white" value={c.expression || ''} placeholder="unitPrice > 0" onChange={e => upd(i, { expression: e.target.value, name: c.name || e.target.value })} />
          <div className="flex gap-1 items-center">
            <div className="flex-1"><Dropdown value={c.onFail || 'reject_row'} onChange={v => upd(i, { onFail: v })} options={[{ value: 'reject_row', label: 'ไม่ผ่าน = ตัดแถวนั้นทิ้ง' }, { value: 'fail_run', label: 'ไม่ผ่าน = ยกเลิกทั้งรอบ' }]} /></div>
            <button className="w-8 h-10 hover:bg-[#e8e8e8] flex items-center justify-center" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="ลบ"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      ))}
      <button className="h-8 px-2 text-[14px] text-[#0f62fe] hover:bg-[#e8e8e8] flex items-center gap-1" onClick={() => onChange([...value, { name: '', expression: '', onFail: 'reject_row' }])}><Plus className="h-4 w-4" /> เพิ่มเงื่อนไข</button>
    </div>
  );
}
