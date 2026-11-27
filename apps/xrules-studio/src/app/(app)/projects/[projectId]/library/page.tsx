'use client';
// The project library: decisions and calculations products share. Each item lists who uses it and how;
// opening one shows what its pending change does to each product (tests and cases per product) before approval.
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Btn, Input, Modal } from '@/components/pipeline/ui';
import { usePerms } from '@/lib/perms';
import { kindName } from '@/lib/kinds';

const MODE: Record<string, string> = { use: 'Use', extend: 'Extend', own: 'Own' };
const how = (u: any) => [MODE[u.mode], u.mode !== 'own' && (u.pin === 'latest' ? 'latest' : `stays on v${u.pin}`), u.changes && (u.changes.off || u.changes.added) ? `${u.changes.off} off · ${u.changes.added} added here` : ''].filter(Boolean).join(' · ');
const H = ({ children }: { children: React.ReactNode }) => <h3 className="m-0 mb-2 text-[12px] font-semibold tracking-[.4px] text-[#525252]">{children}</h3>;

export default function LibraryPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const sp = useSearchParams(); const router = useRouter(); const perms = usePerms(); const qc = useQueryClient();
  const open = sp?.get('item') || null;
  const pick = (id: string | null) => router.replace(id ? `/p/${projectId}/library?item=${id}` : `/p/${projectId}/library`, { scroll: false });
  const { data: items = [] } = useQuery({ queryKey: ['library', projectId], queryFn: () => api.get<any[]>(`/platform/library?project_id=${projectId}`) });
  const { data: sug } = useQuery({ queryKey: ['library-dups', projectId], queryFn: () => api.get<any>(`/platform/library/duplicates?project_id=${projectId}`), enabled: !!perms.write });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['library', projectId] }); qc.invalidateQueries({ queryKey: ['library-dups', projectId] }); };
  const move = useMutation({ meta: { failLabel: "Couldn't move to library" }, mutationFn: (ids: string[]) => api.post<any>('/platform/library/move', { ruleIds: ids }), onSuccess: (r: any) => { refresh(); pick(r.itemId); } });
  const [pair, setPair] = useState<any>(null); const [pname, setPname] = useState('');
  const makePair = useMutation({ meta: { silent: true }, mutationFn: () => api.post('/platform/settings-table/make-pair', { ...pair, name: pname.trim() }), onSuccess: () => { setPair(null); refresh(); } });
  const list = items as any[];

  return (
    <div className="px-8 py-6 max-w-[1300px]">
      <PageHead title="Library" />
      {perms.write && sug && (sug.moves.length > 0 || sug.settings.length > 0) && (
        <section className="mb-8">
          <h2 className="text-[16px] text-[#161616] mb-2">Suggestions</h2>
          <div className="bg-white border border-[#e0e0e0]">
            {sug.moves.map((m: any) => (
              <div key={m.a.ruleId + m.b.ruleId} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3 border-b border-[#e0e0e0] last:border-b-0">
                <span className="flex-1 min-w-[260px] text-[14px]"><b className="font-semibold">{m.a.product}</b> {m.a.name} and <b className="font-semibold">{m.b.product}</b> {m.b.name} hold {m.equal} equal line{m.equal === 1 ? '' : 's'}</span>
                <button type="button" className="h-8 px-3 text-[14px] border border-[#8d8d8d] hover:bg-[#e8e8e8]" disabled={move.isPending} onClick={() => move.mutate([m.a.ruleId, m.b.ruleId])}>Move to library</button>
              </div>))}
            {sug.settings.map((s: any, i: number) => (
              <div key={i} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3 border-b border-[#e0e0e0] last:border-b-0">
                <span className="flex-1 min-w-[260px] text-[14px]">Same line, one number differs: <b className="font-semibold">{s.a.product}</b> {s.a.value} · <b className="font-semibold">{s.b.product}</b> {s.b.value}<span className="block text-[12px] text-[#525252] truncate">{s.a.name} · {s.label ? `${s.label} = ` : ''}{s.a.text}</span></span>
                <button type="button" className="h-8 px-3 text-[14px] border border-[#8d8d8d] hover:bg-[#e8e8e8]" onClick={() => { setPname(''); setPair(s); }}>Make it a setting</button>
              </div>))}
          </div>
        </section>)}

      <div className={`grid gap-6 items-start ${open ? 'xl:grid-cols-[420px_minmax(0,1fr)]' : ''}`}>
        <section className="bg-white border border-[#e0e0e0]">
          <div className="grid grid-cols-[minmax(0,1fr)_80px] px-5 h-10 items-center text-[12px] font-semibold text-[#525252] bg-[#f4f4f4] border-b border-[#e0e0e0]"><span>Item · used by</span><span className="text-right">Version</span></div>
          {list.map(it => (
            <button key={it.id} type="button" onClick={() => pick(it.id)} className={`w-full text-left grid grid-cols-[minmax(0,1fr)_80px] px-5 py-3 border-b border-[#e0e0e0] last:border-b-0 border-l-2 ${open === it.id ? 'border-l-[#0f62fe] bg-[#edf5ff]' : 'border-l-transparent hover:bg-[#f4f4f4]'}`}>
              <span className="min-w-0"><span className="block text-[15px] text-[#161616]">{it.name}</span>
                <span className="block text-[12px] text-[#525252]">{kindName(it.type)} · {it.lines} line{it.lines === 1 ? '' : 's'}{it.reviewState === 'PENDING' ? ' · waiting for approval' : it.status !== 'published' ? ' · changed, not approved' : ''}</span>
                {it.users.map((u: any) => <span key={u.ruleId} className="block text-[13px] text-[#161616]">{u.product || u.topic} <span className="text-[#525252]">· {how(u)}{u.behind ? ' · newer version approved' : ''}</span></span>)}
                {!it.users.length && <span className="block text-[13px] text-[#6f6f6f]">No product uses it</span>}</span>
              <span className="text-right text-[14px] tabular-nums">v{it.latest ?? it.version}</span>
            </button>))}
          {!list.length && <div className="px-5 py-6 text-[14px] text-[#525252]">Nothing in the library yet</div>}
        </section>
        {open && <Ripple projectId={projectId} id={open} canWrite={!!perms.write} onClose={() => pick(null)} />}
      </div>

      {pair && <Modal title="Make it a setting" onClose={() => setPair(null)} onSubmit={() => makePair.mutate()} submitLabel={makePair.isPending ? 'Making' : 'Make it a setting'} submitDisabled={!pname.trim() || makePair.isPending} error={makePair.error ? String((makePair.error as any).message) : null}>
        <div className="text-[14px]">{pair.a.product} keeps {pair.a.value}, {pair.b.product} keeps {pair.b.value}; both lines read the setting</div>
        <Input id="mp-name" label="Setting name" value={pname} onChange={setPname} placeholder="min RI" />
      </Modal>}
    </div>
  );
}

/** What approving this item's change does to each product that uses it. */
function Ripple({ projectId, id, canWrite, onClose }: { projectId: string; id: string; canWrite: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: r, isFetching } = useQuery({ queryKey: ['library-ripple', id], queryFn: () => api.get<any>(`/platform/library/${id}/ripple`) });
  const ask = useMutation({ meta: { failLabel: "Couldn't request approval" }, mutationFn: () => api.post('/platform/reviews', { targetType: 'rule', targetId: id, evidence: { ripple: r } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['library-ripple', id] }); qc.invalidateQueries({ queryKey: ['library', projectId] }); } });
  if (!r) return <section className="bg-white border border-[#e0e0e0] px-6 py-5 text-[14px] text-[#6f6f6f]">Running each product's test cases</section>;
  const affected = r.products.filter((p: any) => p.affected); const stays = r.products.filter((p: any) => !p.affected);
  return (
    <section className="bg-white border border-[#e0e0e0] min-w-0">
      <div className="px-6 pt-5 pb-4 flex items-start gap-3 border-b border-[#e0e0e0]">
        <div className="flex-1 min-w-0"><div className="text-[13px] text-[#525252]">Library item</div><h2 className="m-0 text-[22px] leading-8 text-[#161616]">{r.name}</h2>
          <div className="text-[13px] text-[#525252] mt-1">{r.latest ? `v${r.latest} approved` : 'not approved yet'}{r.changed ? ` · v${r.draftVersion} changed: ${r.lines.live} to ${r.lines.draft} lines` : ' · no change waiting'}{r.reviewState === 'PENDING' ? ' · waiting for approval' : ''}</div></div>
        <Link href={`/p/${projectId}/rules/${id}`} className="h-8 px-2 flex items-center text-[14px]">Edit</Link>
        <button type="button" onClick={onClose} className="h-8 px-2 text-[14px] text-[#0f62fe] hover:bg-[#e8e8e8]">Close</button>
      </div>
      <div className="px-6 py-5 space-y-6">
        <div><H>{r.changed ? 'CHANGES FOR' : 'USED BY'}</H>
          {affected.map((p: any) => (
            <div key={p.ruleId} className="border-b border-[#e0e0e0] py-3">
              <div className="flex flex-wrap items-baseline gap-x-4"><Link href={`/p/${projectId}/topics/${p.topicId}`} className="text-[15px]">{p.product}</Link><span className="text-[13px] text-[#525252]">{p.topic} · {MODE[p.mode]}</span><span className="flex-1" />
                {p.tests && (p.tests.total ? <span className={`text-[14px] tabular-nums ${p.tests.pass < p.tests.total ? 'text-[#da1e28]' : 'text-[#198038]'}`}>tests {p.tests.pass}/{p.tests.total}{r.changed && p.tests.passBefore !== p.tests.pass ? ` (was ${p.tests.passBefore})` : ''}</span> : <span className="text-[14px] text-[#6f6f6f]">no test cases</span>)}</div>
              {r.changed && <div className="text-[13px] text-[#525252] mt-0.5">{p.lines.before} to {p.lines.after} lines · {p.cases?.length ? `${p.cases.length} case${p.cases.length === 1 ? '' : 's'} change` : 'no case changes'}</div>}
              {(p.cases || []).map((c: any) => (
                <div key={c.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-[13px] mt-1 pl-3 border-l border-[#e0e0e0]">
                  <span className="min-w-0"><span className="text-[#161616]">{c.name}</span> <span className="text-[#525252]">{Object.entries(c.result || {}).map(([k, v]) => `${k}: ${JSON.stringify(c.was?.[k])} to ${JSON.stringify(v)}`).filter((_, i) => i < 3).join(' · ')}</span></span>
                  <span className={c.pass ? 'text-[#198038]' : 'text-[#da1e28]'}>{c.pass ? 'pass' : 'fail'}{c.wasPass !== null && c.wasPass !== c.pass ? ` (was ${c.wasPass ? 'pass' : 'fail'})` : ''}</span>
                </div>))}
            </div>))}
          {!affected.length && <div className="text-[14px] text-[#6f6f6f]">No product follows the latest version</div>}
        </div>
        <div><H>NOT CHANGED</H>
          {stays.map((p: any) => <div key={p.ruleId} className="text-[14px] py-1"><Link href={`/p/${projectId}/topics/${p.topicId}`}>{p.product}</Link> <span className="text-[#525252]">· {p.why}</span></div>)}
          {r.notChanged.map((n: string) => <div key={n} className="text-[14px] py-1">{n} <span className="text-[#525252]">· does not use it</span></div>)}
          {!stays.length && !r.notChanged.length && <div className="text-[14px] text-[#6f6f6f]">Every product takes the change</div>}
        </div>
        {canWrite && r.changed && r.reviewState !== 'PENDING' && <Btn disabled={ask.isPending || isFetching} onClick={() => ask.mutate()}>Request approval</Btn>}
        {r.reviewState === 'PENDING' && <Link href={`/p/${projectId}/approvals`} className="text-[14px]">Open in Approvals</Link>}
      </div>
    </section>
  );
}
