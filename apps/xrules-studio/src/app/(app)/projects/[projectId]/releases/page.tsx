'use client';
// Releases: immutable snapshots of the whole configuration. Compare any two, see what is live per environment,
// promote to the next environment, export one, or ask to roll back to one (an approver agrees; that makes a new release).
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, downloadFile, releasesApi, environmentsApi } from '@/lib/api';
import { PageHead, Table, Td, Btn, Input, Panel, Modal, fmtTime } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';
import { usePerms, useEnvironment } from '@/lib/perms';

const KIND_LABEL: Record<string, string> = { words: 'Words', valueSets: 'Value sets', reasonCodes: 'Reason codes', productSettings: 'Settings', topics: 'Topics', rules: 'Rules', flows: 'Flows', apis: 'APIs', testCases: 'Test cases', connections: 'Connections' };
const contents = (r: any) => r.manifest?.counts
  ? ['topics', 'rules', 'flows', 'apis', 'testCases'].filter(k => r.manifest.counts[k]).map(k => `${r.manifest.counts[k]} ${KIND_LABEL[k].toLowerCase()}`).join(' · ')
  : `${r.manifest?.rules?.length ?? 0} rules · ${r.manifest?.flows?.length ?? 0} flows · versions only`;

export default function ReleasesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const perms = usePerms();
  const env = useEnvironment();
  const { data: rows = [] } = useQuery({ queryKey: ['releases', projectId], queryFn: () => releasesApi.list(projectId) });
  const { data: envs = [] } = useQuery({ queryKey: ['environments', projectId], queryFn: () => environmentsApi.list(projectId) });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [rollback, setRollback] = useState<any>(null);
  const [promote, setPromote] = useState<any>(null);
  const [to, setTo] = useState('UAT');
  const [cmp, setCmp] = useState<{ from?: string; to?: string }>({});
  const [msg, setMsg] = useState<string | null>(null);
  const inv = () => { qc.invalidateQueries({ queryKey: ['releases', projectId] }); qc.invalidateQueries({ queryKey: ['environments', projectId] }); };

  const create = useMutation({ meta: { silent: true }, mutationFn: () => releasesApi.create({ projectId, name: name.trim() }), onSuccess: () => { setCreating(false); setName(''); inv(); } });
  const askRollback = useMutation({ meta: { silent: true }, mutationFn: () => api.post('/platform/ops/rollback', { releaseId: rollback.id, note }), onSuccess: () => { setMsg(`Rollback to ${rollback.name} is waiting for approval`); setRollback(null); setNote(''); } });
  const doPromote = useMutation({ meta: { silent: true }, mutationFn: () => api.post<any>('/platform/ops/promote', { releaseId: promote.id, to }), onSuccess: (r: any) => { setMsg(`${r.release} is live in ${r.environment} · ${r.tests.passed} of ${r.tests.total} tests pass`); setPromote(null); inv(); } });
  const { data: diff, error: diffErr } = useQuery({ queryKey: ['release-compare', cmp.from, cmp.to], enabled: !!cmp.from && !!cmp.to && cmp.from !== cmp.to, queryFn: () => api.get<any>(`/platform/ops/compare?from=${cmp.from}&to=${cmp.to}`) });

  const liveIn = (id: string) => (envs as any[]).filter(e => e.releaseId === id).map(e => e.name).join(', ');
  const opts = (rows as any[]).map(r => ({ value: r.id, label: r.name }));
  const canRelease = !env.production && (perms.admin || perms.integrate);
  const nextEnvs = ['QA', 'UAT', 'PROD'].map(v => ({ value: v, label: v === 'PROD' ? 'PRODUCTION' : v }));

  return (
    <div className="px-8 py-6 max-w-[1300px]">
      <PageHead title="Releases" sub={`${rows.length} release${rows.length === 1 ? '' : 's'}`} actions={canRelease ? <Btn onClick={() => { setName(new Date().toISOString().slice(0, 10)); setCreating(true); }}>New release</Btn> : undefined} />
      {msg && <div className="mb-3 text-[14px] text-[#198038]">{msg}</div>}

      <Panel title="Live per environment" className="mb-4">
        {(envs as any[]).length === 0 ? <div className="text-[14px] text-[#525252]">No environments yet · <Link className="text-[#0f62fe] hover:underline" href={`/p/${projectId}/environments`}>Environments</Link></div> : (
          <div className="grid gap-x-8 gap-y-2 sm:grid-cols-3 text-[14px]">
            {(envs as any[]).map(e => <div key={e.id}><div className="text-[12px] text-[#525252]">{e.name}</div><div className="font-semibold">{e.release?.name || 'Nothing released'}</div></div>)}
          </div>
        )}
      </Panel>

      <Table head={['Release', 'Made', 'Contents', 'Live in', '']} empty={!rows.length ? <div className="px-4 py-8 text-[14px] text-[#525252]">No releases yet</div> : null}>
        {(rows as any[]).map(r => (
          <tr key={r.id} className="hover:bg-[#e8e8e8]">
            <Td><div className="font-semibold">{r.name}</div>{r.description && <div className="text-[12px] text-[#525252]">{r.description}</div>}{r.status === 'revoked' && <div className="text-[12px] text-[#da1e28]">Revoked</div>}</Td>
            <Td>{fmtTime(r.createdAt)}</Td>
            <Td>{contents(r)}</Td>
            <Td>{liveIn(r.id) || '—'}</Td>
            <Td className="text-right">
              <button className="h-8 px-3 text-[14px] text-[#0f62fe] hover:bg-[#e0e0e0] disabled:text-[#8d8d8d]" disabled={!r.manifest?.full} onClick={() => downloadFile(`/platform/ops/export?release_id=${r.id}&format=zip`, `${r.name}.zip`).catch(e => setMsg(e.message))}>Export</button>
              {canRelease && <button className="h-8 px-3 text-[14px] text-[#0f62fe] hover:bg-[#e0e0e0]" onClick={() => { setPromote(r); doPromote.reset(); }}>Promote</button>}
              {perms.write && <button className="h-8 px-3 text-[14px] text-[#0f62fe] hover:bg-[#e0e0e0] disabled:text-[#8d8d8d]" disabled={!r.manifest?.full} onClick={() => { setRollback(r); askRollback.reset(); }}>Roll back to this</button>}
            </Td>
          </tr>
        ))}
      </Table>

      {(rows as any[]).length > 1 && (
        <Panel title="Compare releases" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2 max-w-[640px] mb-3">
            <div><div className="text-[12px] text-[#525252] mb-1.5">From</div><Dropdown value={cmp.from} onChange={v => setCmp({ ...cmp, from: v })} options={opts} /></div>
            <div><div className="text-[12px] text-[#525252] mb-1.5">To</div><Dropdown value={cmp.to} onChange={v => setCmp({ ...cmp, to: v })} options={opts} /></div>
          </div>
          {diffErr && <div className="text-[14px] text-[#da1e28]">{String((diffErr as any).message)}</div>}
          {diff && (diff.changes.length === 0 ? <div className="text-[14px]">The same</div> : (
            <table className="w-full text-[14px] border-collapse">
              <thead><tr className="bg-[#f4f4f4] text-[12px] font-semibold text-[#525252] text-left"><th className="px-4 h-10">What</th><th className="px-4">Name</th><th className="px-4">Change</th></tr></thead>
              <tbody>{diff.changes.map((c: any) => (
                <tr key={`${c.kind}:${c.key}`} className="border-b border-[#e0e0e0]"><td className="px-4 h-10">{KIND_LABEL[c.kind] || c.kind}</td><td className="px-4 font-mono text-[13px]">{c.key}</td>
                  <td className={`px-4 ${c.change === 'removed' ? 'text-[#da1e28]' : c.change === 'added' ? 'text-[#198038]' : ''}`}>{c.change === 'changed' ? `Changed: ${(c.fields || []).join(', ')}` : c.change === 'added' ? 'Added' : 'Removed'}</td></tr>
              ))}</tbody>
            </table>
          ))}
          {diff && !diff.full && <div className="mt-2 text-[13px] text-[#525252]">Versions only: one of these releases was made before releases held a full snapshot</div>}
        </Panel>
      )}

      {creating && (
        <Modal title="New release" onClose={() => setCreating(false)} onSubmit={() => create.mutate()} submitLabel={create.isPending ? 'Making' : 'Make release'} submitDisabled={!name.trim() || create.isPending} error={create.error ? String((create.error as any).message) : null}>
          <Input id="rel-name" label="Name" value={name} onChange={setName} />
        </Modal>
      )}
      {rollback && (
        <Modal title={`Roll back to ${rollback.name}`} onClose={() => setRollback(null)} onSubmit={() => askRollback.mutate()} submitLabel={askRollback.isPending ? 'Sending' : 'Request approval'} submitDisabled={askRollback.isPending} danger error={askRollback.error ? String((askRollback.error as any).message) : null}>
          <div className="text-[14px] mb-3">Once approved, everything goes back to {rollback.name} and a new release equal to it is made.</div>
          <Input id="rb-note" label="Why" value={note} onChange={setNote} />
        </Modal>
      )}
      {promote && (
        <Modal title={`Promote ${promote.name}`} onClose={() => setPromote(null)} onSubmit={() => doPromote.mutate()} submitLabel={doPromote.isPending ? 'Promoting' : 'Promote'} submitDisabled={doPromote.isPending} error={doPromote.error ? String((doPromote.error as any).message) : null}>
          <div className="text-[12px] text-[#525252] mb-1.5">To</div>
          <Dropdown value={to} onChange={setTo} options={nextEnvs} />
        </Modal>
      )}
    </div>
  );
}
