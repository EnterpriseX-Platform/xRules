'use client';
// Live parameters: settings marked tunable can be changed on a live system by people who may tune them:
// change → impact (topic tests now and with the new values) → approval → effective at a date and time → audit.
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Panel, Btn, Input, fmtTime } from '@/components/pipeline/ui';
import { usePerms } from '@/lib/perms';

const key = (id: string, p: string) => `${id}|${p}`;
const stateOf = (r: any) => r.status === 'APPROVED' ? (r.snapshot?.applied ? `Live since ${fmtTime(r.snapshot.appliedAt)}` : `Approved · live at ${fmtTime(r.snapshot?.effectiveAt)}`) : r.status === 'PENDING' ? 'Waiting for approval' : r.status === 'REJECTED' ? 'Rejected' : 'Withdrawn';

export default function LiveParametersPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const perms = usePerms(); const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['live-params', projectId], queryFn: () => api.get<any>(`/platform/live-params?project_id=${projectId}`) });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const [marking, setMarking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const inv = () => qc.invalidateQueries({ queryKey: ['live-params', projectId] });

  const products: string[] = data?.products || [];
  const rows: any[] = data?.rows || [];
  const tunable = rows.filter(r => r.tunable);
  const changes = Object.entries(edits).map(([k, to]) => { const [settingId, product] = k.split('|'); return { settingId, product, to }; })
    .filter(c => { const r = rows.find(x => x.id === c.settingId); return r && String(r.values?.[c.product] ?? '') !== String(c.to).trim() && String(c.to).trim() !== ''; });

  const impact = useMutation({ meta: { silent: true }, mutationFn: () => api.post<any>('/platform/live-params/impact', { projectId, changes }) });
  const request = useMutation({ meta: { silent: true }, mutationFn: () => api.post('/platform/live-params/request', { projectId, changes, note, effectiveAt: when ? new Date(when).toISOString() : undefined }),
    onSuccess: () => { setMsg('Sent for approval'); setEdits({}); setNote(''); setWhen(''); impact.reset(); inv(); } });
  const mark = useMutation({ meta: { silent: true }, mutationFn: (v: { id: string; tunable: boolean }) => api.post('/platform/live-params/tunable', { projectId, ids: [v.id], tunable: v.tunable }), onSuccess: inv });

  const box = 'w-full h-10 px-3 bg-transparent text-[14px] text-right outline-none focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2';
  const im = impact.data;

  return (
    <div className="px-8 py-6 max-w-[1300px]">
      <PageHead title="Live parameters" sub={data?.environment} actions={perms.admin ? <Btn kind="tertiary" onClick={() => setMarking(m => !m)}>{marking ? 'Done' : 'Choose live parameters'}</Btn> : undefined} />
      {msg && <div className="mb-3 text-[14px] text-[#198038]">{msg}</div>}

      {marking && (
        <Panel title="Which settings are live parameters" className="mb-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(r => <label key={r.id} className="flex items-center gap-2 text-[14px] cursor-pointer"><input type="checkbox" className="h-4 w-4 accent-[#161616]" checked={!!r.tunable} onChange={e => mark.mutate({ id: r.id, tunable: e.target.checked })} />{r.name}</label>)}
            {!rows.length && <div className="text-[14px] text-[#525252]">No settings yet · <Link className="text-[#0f62fe] hover:underline" href={`/p/${projectId}/product-settings`}>Product settings</Link></div>}
          </div>
        </Panel>
      )}

      <div className="bg-white border border-[#e0e0e0] overflow-x-auto mb-4">
        <table className="w-full border-collapse text-[14px]">
          <thead><tr className="bg-[#f4f4f4] text-[12px] font-semibold text-[#525252] text-left"><th className="px-4 h-10 min-w-[240px]">Parameter</th>{products.map(p => <th key={p} className="px-4 text-right min-w-[120px]">{p}</th>)}</tr></thead>
          <tbody>
            {tunable.map(r => (
              <tr key={r.id} className="border-b border-[#e0e0e0]">
                <td className="px-4 h-10">{r.name}</td>
                {products.map(p => { const k = key(r.id, p); const now = r.values?.[p]; const v = edits[k] ?? (now ?? ''); const changed = k in edits && String(edits[k]) !== String(now ?? '');
                  return <td key={p} className={`p-0 ${changed ? 'bg-[#edf5ff]' : ''}`}>{perms.tune
                    ? <input aria-label={`${r.name} ${p}`} className={box} value={String(v)} onChange={e => setEdits({ ...edits, [k]: e.target.value })} />
                    : <div className="px-3 h-10 flex items-center justify-end">{String(now ?? '—')}</div>}</td>; })}
              </tr>
            ))}
            {!tunable.length && <tr><td colSpan={products.length + 1} className="px-4 py-8 text-[#525252]">No live parameters yet</td></tr>}
          </tbody>
        </table>
      </div>

      {perms.tune && changes.length > 0 && (
        <Panel title={`${changes.length} change${changes.length === 1 ? '' : 's'}`} className="mb-4">
          <div className="grid gap-4 sm:grid-cols-2 max-w-[720px] mb-3">
            <div><label htmlFor="lp-when" className="block text-[12px] text-[#525252] mb-1.5">Effective from</label><input id="lp-when" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} className="w-full h-10 px-3 bg-[#f4f4f4] border-b border-[#8d8d8d] text-[14px] outline-none focus:outline focus:outline-2 focus:outline-[#0f62fe]" /></div>
            <Input id="lp-note" label="Why" value={note} onChange={setNote} />
          </div>
          <div className="flex gap-2 mb-3">
            <Btn kind="secondary" onClick={() => impact.mutate()} disabled={impact.isPending}>{impact.isPending ? 'Running tests' : 'See impact'}</Btn>
            <Btn onClick={() => request.mutate()} disabled={request.isPending}>{request.isPending ? 'Sending' : 'Request approval'}</Btn>
            <Btn kind="tertiary" onClick={() => { setEdits({}); impact.reset(); }}>Discard</Btn>
          </div>
          {(impact.error || request.error) && <div className="text-[14px] text-[#da1e28] mb-2">{String(((impact.error || request.error) as any).message)}</div>}
          {im && (
            <div className="text-[14px]">
              <div className="mb-2">{im.topics.length ? `${im.regressions} test case${im.regressions === 1 ? '' : 's'} that pass now would fail` : 'No topic tests read these values'}</div>
              {im.topics.map((t: any) => (
                <div key={t.topic} className="mb-3">
                  <div className="font-semibold">{t.topic}{t.product ? ` · ${t.product}` : ''}: {t.passedBefore} → {t.passedAfter} of {t.total} pass</div>
                  {t.changed.map((c: any) => <div key={c.name} className="pl-4 text-[13px]"><span className={c.before && !c.after ? 'text-[#da1e28]' : ''}>{c.name}</span> · {JSON.stringify(c.resultBefore)} → {JSON.stringify(c.resultAfter)}</div>)}
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      <Panel title="Requests" className="mb-4">
        {!(data?.requests || []).length ? <div className="text-[14px] text-[#525252]">No requests yet</div> : (
          <table className="w-full text-[14px] border-collapse">
            <thead><tr className="bg-[#f4f4f4] text-[12px] font-semibold text-[#525252] text-left"><th className="px-4 h-10">Change</th><th className="px-4">Requested</th><th className="px-4">Approved by</th><th className="px-4">State</th></tr></thead>
            <tbody>{data.requests.map((r: any) => (
              <tr key={r.id} className="border-b border-[#e0e0e0] align-top">
                <td className="px-4 py-2">{(r.snapshot?.changes || []).map((c: any, i: number) => <div key={i}>{c.name} · {c.product}: {String(c.from ?? '—')} → {String(c.to)}</div>)}{r.note && <div className="text-[12px] text-[#525252]">{r.note}</div>}</td>
                <td className="px-4 py-2 whitespace-nowrap">{r.submittedBy}<div className="text-[12px] text-[#525252]">{fmtTime(r.createdAt)}</div></td>
                <td className="px-4 py-2 whitespace-nowrap">{r.reviewedBy || '—'}</td>
                <td className="px-4 py-2 whitespace-nowrap">{stateOf(r)}{r.status === 'PENDING' && <div><Link className="text-[13px] text-[#0f62fe] hover:underline" href={`/p/${projectId}/approvals`}>Approvals</Link></div>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Panel>

      <Panel title="Audit trail">
        {!(data?.audit || []).length ? <div className="text-[14px] text-[#525252]">Nothing yet</div> : (
          <div className="text-[14px] divide-y divide-[#e0e0e0]">
            {data.audit.map((a: any, i: number) => <div key={i} className="py-2 flex gap-4"><span className="w-40 shrink-0 text-[#525252]">{fmtTime(a.at)}</span><span className="w-32 shrink-0">{a.action === 'live_param.apply' ? 'Went live' : a.action === 'live_param.request' ? 'Requested' : a.action}</span><span className="flex-1">{(a.details?.changes || []).map((c: any) => `${c.name} · ${c.product}: ${String(c.from ?? '—')} → ${String(c.to)}`).join('; ')}</span><span className="text-[#525252]">{a.by || a.details?.approvedBy || ''}</span></div>)}
          </div>
        )}
      </Panel>
    </div>
  );
}
