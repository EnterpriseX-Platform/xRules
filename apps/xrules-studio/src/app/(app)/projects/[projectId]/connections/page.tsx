'use client';
// Connections (Data Layer): encrypted, per-environment settings; test + read-only verification.
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, Btn, fmtTime } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';

const TYPES = [
  { value: 'oracle', label: 'Oracle', fields: [['host', 'Host'], ['port', 'Port'], ['serviceName', 'Service name'], ['user', 'User'], ['password', 'Password', 1]] },
  { value: 'postgres', label: 'PostgreSQL', fields: [['host', 'Host'], ['port', 'Port'], ['database', 'Database'], ['user', 'User'], ['password', 'Password', 1]] },
  { value: 'http', label: 'REST API', fields: [['baseUrl', 'Base URL'], ['token', 'Bearer token', 1], ['healthPath', 'Path สำหรับทดสอบ']] },
  { value: 'mysql', label: 'MySQL', fields: [['host', 'Host'], ['port', 'Port'], ['database', 'Database'], ['user', 'User'], ['password', 'Password', 1]] },
  { value: 's3', label: 'S3 / MinIO', fields: [['endpoint', 'Endpoint'], ['bucket', 'Bucket'], ['accessKey', 'Access key'], ['secretKey', 'Secret key', 1]] },
] as const;
const ENVS = ['UAT', 'PROD'];

export default function ConnectionsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: rows = [] } = useQuery({ queryKey: ['connections', projectId], queryFn: () => api.get<any[]>(`/connections?project_id=${projectId}`) });
  const test = useMutation({ mutationFn: (id: string) => api.post<any>(`/data/connections/${id}/test`), onSettled: () => qc.invalidateQueries({ queryKey: ['connections', projectId] }) });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/connections/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['connections', projectId] }) });

  return (
    <div className="px-8 py-6">
      <PageHead title="Connections" sub="ค่าลับเข้ารหัส · ค่าแยก UAT / PROD · ใช้อ่านข้อมูลอย่างเดียว" actions={<Btn onClick={() => setOpen(true)}>New Connection</Btn>} />
      <Table head={['Connection', 'ชนิด', 'ผลทดสอบล่าสุด', 'อ่านอย่างเดียว', '']}
        empty={!rows.length ? <div className="px-4 py-8 text-[14px] text-[#525252]">ยังไม่มี Connection</div> : null}>
        {rows.map((c: any) => {
          const t = c.meta?.lastTest;
          return (
            <tr key={c.id}>
              <Td><div className="font-semibold">{c.name}</div><div className="font-mono text-[12px] text-[#525252]">{c.slug}</div></Td>
              <Td><Tag tone="blue">{c.type}</Tag></Td>
              <Td>{t ? <span className="flex items-center gap-2">{t.ok ? <Tag tone="green">เชื่อมต่อได้ · {t.ms} ms</Tag> : <Tag tone="red">เชื่อมต่อไม่ได้</Tag>}<span className="text-[12px] text-[#525252]">{t.env} · {fmtTime(t.at)}</span></span> : '—'}
                {t && !t.ok && <div className="text-[12px] text-[#a2191f]">{t.error}</div>}</Td>
              <Td>{t?.readOnly ? (t.readOnly.verified ? <Tag tone="green">ยืนยันแล้ว</Tag> : <span title={t.readOnly.problems.join('\n')}><Tag tone="red">เขียนได้ {t.readOnly.problems.length} จุด</Tag></span>) : '—'}</Td>
              <Td><div className="flex gap-1">
                <button className="h-8 px-3 text-[#0f62fe] hover:bg-[#e8e8e8] disabled:opacity-40" disabled={test.isPending} onClick={() => test.mutate(c.id)}>{test.isPending && test.variables === c.id ? 'กำลังทดสอบ' : 'Test connection'}</button>
                <button className="h-8 px-3 text-[#da1e28] hover:bg-[#fff1f1]" onClick={() => remove.mutate(c.id)}>ลบ</button>
              </div></Td>
            </tr>
          );
        })}
      </Table>
      {open && <NewConnection projectId={projectId} onClose={() => setOpen(false)} />}
    </div>
  );
}

function NewConnection({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('oracle');
  const [env, setEnv] = useState('UAT');
  const [vals, setVals] = useState<Record<string, Record<string, string>>>({ UAT: {}, PROD: {} });
  const [allowed, setAllowed] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const t = TYPES.find(x => x.value === type)!;
  const save = useMutation({
    mutationFn: async () => {
      const envs: any = {};
      for (const e of ENVS) if (Object.values(vals[e]).some(Boolean)) envs[e] = { ...vals[e], ...(vals[e].port ? { port: Number(vals[e].port) } : {}) };
      if (!Object.keys(envs).length) throw new Error('กรอกค่าอย่างน้อย 1 environment');
      const c = await api.post<any>('/connections', { name, projectId, type, config: { envs, allowedObjects: allowed.split(',').map(s => s.trim()).filter(Boolean) } });
      const r = await api.post<any>(`/data/connections/${c.id}/test?env=${Object.keys(envs)[0]}`);
      if (r.ok && r.readOnly && !r.readOnly.verified) {
        await api.del(`/connections/${c.id}`);
        throw new Error(`บัญชีนี้เขียนข้อมูลได้ (${r.readOnly.problems.slice(0, 3).join(', ')}) ใช้บัญชีที่อ่านได้อย่างเดียว`);
      }
      return r;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['connections', projectId] }); onClose(); },
    onError: (e: any) => setErr(e.message),
  });
  return (
    <div className="fixed inset-0 bg-[rgba(22,22,22,.5)] flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white w-full max-w-[640px]" onClick={e => e.stopPropagation()}>
        <div className="px-4 pt-4 pb-2 flex items-start justify-between">
          <div><div className="text-[12px] text-[#525252]">Connections</div><div className="text-[20px]">New Connection</div></div>
          <button className="h-10 w-10 flex items-center justify-center hover:bg-[#e8e8e8]" onClick={onClose} aria-label="ปิด"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-4 py-3 space-y-4 max-h-[65vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div><label htmlFor="cn-name" className="block text-[12px] text-[#525252] mb-1.5">ชื่อ</label><input id="cn-name" className="input w-full" value={name} onChange={e => setName(e.target.value)} placeholder="oracle-neb-ro" /></div>
            <div><div className="text-[12px] text-[#525252] mb-1.5">ชนิด</div><Dropdown value={type} onChange={setType} options={TYPES.map(x => ({ value: x.value, label: x.label }))} /></div>
          </div>
          <div className="flex border-b border-[#e0e0e0]">{ENVS.map(e => <button key={e} onClick={() => setEnv(e)} className={`h-10 px-4 text-[14px] ${env === e ? 'border-b-2 border-[#0f62fe] font-semibold' : 'text-[#525252]'}`}>{e}</button>)}</div>
          <div className="grid grid-cols-2 gap-4">
            {t.fields.map(([k, label, secret]: any) => (
              <div key={`${env}-${k}`}><label htmlFor={`cn-${k}`} className="block text-[12px] text-[#525252] mb-1.5">{label}</label>
                <input id={`cn-${k}`} type={secret ? 'password' : 'text'} className="input w-full font-mono" value={vals[env][k] || ''} onChange={e => setVals(v => ({ ...v, [env]: { ...v[env], [k]: e.target.value } }))} /></div>
            ))}
          </div>
          {type !== 'http' && type !== 's3' && <div><label htmlFor="cn-allow" className="block text-[12px] text-[#525252] mb-1.5">ตาราง / view ที่อ่านได้ (คั่นด้วย ,)</label>
            <input id="cn-allow" className="input w-full font-mono" value={allowed} onChange={e => setAllowed(e.target.value)} placeholder="SCBDB.DAS_STANDARD_PRICE_V, APP.BUDGET_REQUEST_V" /></div>}
          {err && <div className="bg-[#fff1f1] border-l-[3px] border-[#da1e28] px-4 py-3 text-[14px]">{err}</div>}
        </div>
        <div className="grid grid-cols-2 h-16 mt-2">
          <button className="bg-[#393939] text-white text-[14px] text-left pl-4 hover:bg-[#474747]" onClick={onClose}>ยกเลิก</button>
          <button className="bg-[#0f62fe] text-white text-[14px] text-left pl-4 hover:bg-[#0353e9] disabled:bg-[#c6c6c6]" disabled={!name || save.isPending} onClick={() => { setErr(null); save.mutate(); }}>{save.isPending ? 'กำลังทดสอบการเชื่อมต่อ' : 'ทดสอบและบันทึก'}</button>
        </div>
      </div>
    </div>
  );
}
