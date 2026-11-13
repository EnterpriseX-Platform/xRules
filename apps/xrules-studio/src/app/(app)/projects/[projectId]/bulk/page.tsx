'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, Btn, Input, TextArea, Panel, Notice, DropZone, fileToBase64, fmtTime, pct } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';

export const STATUS: Record<string, [any, string]> = { QUEUED: ['gray', 'รอคิว'], RUNNING: ['blue', 'กำลังรัน'], PAUSED: ['orange', 'พักไว้'], COMPLETED: ['green', 'เสร็จ'], FAILED: ['red', 'ล้ม'], CANCELLED: ['gray', 'ยกเลิก'] };

export default function BulkPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ name: '', targetType: 'decision_flow', target: '', sourceKind: 'file', dataset: '', rowsJson: '', mapping: '', concurrency: '8' });
  const [file, setFile] = useState<File | null>(null);
  const { data: runs = [] } = useQuery({ queryKey: ['bulk', projectId], queryFn: () => api.get<any[]>(`/platform/bulk?project_id=${projectId}`), refetchInterval: 3000 });
  const { data: flows = [] } = useQuery({ queryKey: ['flows-all', projectId], queryFn: () => api.get<any[]>(`/flows?project_id=${projectId}`) });
  const { data: rules = [] } = useQuery({ queryKey: ['rules', projectId], queryFn: () => api.get<any>(`/rules?project_id=${projectId}`) });
  const { data: sets = [] } = useQuery({ queryKey: ['data-sets', projectId], queryFn: () => api.get<any[]>(`/data/datasets?project_id=${projectId}`) });
  const ruleList: any[] = Array.isArray(rules) ? rules : (rules?.data || rules?.items || []);
  const targets = f.targetType === 'rule' ? ruleList.map((r: any) => ({ value: r.slug, label: r.name })) : (flows as any[]).filter(x => x.kind === 'decision').map(x => ({ value: x.slug, label: x.name }));
  const create = useMutation({
    mutationFn: async () => {
      const source = f.sourceKind === 'file' ? { kind: 'file', name: file!.name, contentBase64: await fileToBase64(file!) }
        : f.sourceKind === 'dataset' ? { kind: 'dataset', dataset: f.dataset } : { kind: 'rows', rows: JSON.parse(f.rowsJson) };
      return api.post<any>('/platform/bulk', { projectId, name: f.name || undefined, targetType: f.targetType, target: f.target, source, mapping: f.mapping ? JSON.parse(f.mapping) : undefined, concurrency: Number(f.concurrency) || 8 });
    },
    onSuccess: r => router.push(`/projects/${projectId}/bulk/${r.id}`),
  });
  return (
    <div className="px-8 py-6">
      <PageHead title="Bulk Runs" sub="รันกฎหรือ Decision Flow กับข้อมูลทีละมาก · ผลเป็นไฟล์ · รันซ้ำเฉพาะแถวที่ผิด" actions={<Btn onClick={() => setOpen(o => !o)}>New Bulk Run</Btn>} />
      {open && (
        <Panel title="Bulk Run ใหม่" className="mb-4">
          <div className="grid grid-cols-3 gap-4">
            <Input id="b-name" label="ชื่อ" value={f.name} onChange={(v: string) => setF({ ...f, name: v })} placeholder="ตรวจคำขอปี 2571 ทั้งหมด" />
            <div><div className="text-[12px] text-[#525252] mb-1.5">รันกับ</div><Dropdown value={f.targetType} onChange={v => setF({ ...f, targetType: v, target: '' })} options={[{ value: 'decision_flow', label: 'Decision Flow' }, { value: 'rule', label: 'Rule' }]} /></div>
            <div><div className="text-[12px] text-[#525252] mb-1.5">ตัวที่รัน (เวอร์ชันที่ publish ล่าสุด)</div><Dropdown value={f.target} onChange={v => setF({ ...f, target: v })} options={targets} /></div>
            <div><div className="text-[12px] text-[#525252] mb-1.5">ข้อมูลเข้า</div><Dropdown value={f.sourceKind} onChange={v => setF({ ...f, sourceKind: v })} options={[{ value: 'file', label: 'ไฟล์ Excel / CSV' }, { value: 'dataset', label: 'Data Set' }, { value: 'rows', label: 'วาง JSON' }]} /></div>
            {f.sourceKind === 'dataset' && <div><div className="text-[12px] text-[#525252] mb-1.5">Data Set</div><Dropdown value={f.dataset} onChange={v => setF({ ...f, dataset: v })} options={(sets as any[]).map(d => ({ value: d.slug, label: d.slug, hint: `${d.rowCount} แถว` }))} /></div>}
            <Input id="b-conc" label="รันพร้อมกัน (แถว)" mono value={f.concurrency} onChange={(v: string) => setF({ ...f, concurrency: v })} />
          </div>
          <div className="mt-4">
            {f.sourceKind === 'file' && <DropZone accept=".xlsx,.csv" onFile={setFile} label={file ? `${file.name} (${Math.round(file.size / 1024)} KB) — ลากไฟล์อื่นมาแทนได้` : 'ลากไฟล์ Excel / CSV มาวาง หรือคลิกเพื่อเลือก'} />}
            {f.sourceKind === 'rows' && <TextArea id="b-rows" label="แถวข้อมูล (JSON array)" rows={6} value={f.rowsJson} onChange={(v: string) => setF({ ...f, rowsJson: v })} />}
          </div>
          <div className="mt-4"><TextArea id="b-map" label="จับคู่คอลัมน์ → input (JSON ใช้ {{ชื่อคอลัมน์}} · เว้นว่างถ้าคอลัมน์ตรงกับ input แล้ว)" rows={5} value={f.mapping} onChange={(v: string) => setF({ ...f, mapping: v })} /></div>
          {create.error && <div className="mt-3"><Notice kind="error">{String((create.error as any).message)}</Notice></div>}
          <div className="mt-4"><Btn onClick={() => create.mutate()} disabled={!f.target || create.isPending || (f.sourceKind === 'file' && !file)}>เริ่มรัน</Btn></div>
        </Panel>
      )}
      <Table head={['ชื่อ', 'รันกับ', 'สถานะ', 'ความคืบหน้า', 'ผ่าน / ไม่ผ่าน / ผิดพลาด', 'เริ่ม']} empty={!runs.length ? <div className="px-4 py-8 text-[14px] text-[#525252]">ยังไม่มี Bulk Run</div> : null}>
        {runs.map((r: any) => (
          <tr key={r.id} className="hover:bg-[#e8e8e8] cursor-pointer" onClick={() => router.push(`/projects/${projectId}/bulk/${r.id}`)}>
            <Td><span className="font-semibold">{r.name || r.id.slice(0, 8)}</span></Td>
            <Td>{r.targetType === 'rule' ? 'Rule' : 'Decision Flow'}{r.targetVersion ? ` v${r.targetVersion}` : ' (ร่าง)'}</Td>
            <Td><Tag tone={STATUS[r.status][0]}>{STATUS[r.status][1]}</Tag></Td>
            <Td><div className="w-40 h-2 bg-[#e0e0e0]"><div className="h-2 bg-[#0f62fe]" style={{ width: `${pct(r.processed, r.total)}%` }} /></div><div className="text-[12px] text-[#525252] mt-1 tabular-nums">{r.processed.toLocaleString()} / {r.total.toLocaleString()}</div></Td>
            <Td mono>{r.passed.toLocaleString()} / {r.failed.toLocaleString()} / {r.errored.toLocaleString()}</Td>
            <Td>{fmtTime(r.createdAt)}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
