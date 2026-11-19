'use client';
import Link from 'next/link';
import { Dropdown } from '@/components/pipeline/Dropdown';
// System admin — every organization, every user, platform settings. System admins only (API enforces it).
import { Suspense, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageContent } from '@/components/layout/AppShell';
import { Btn, Input, Panel, Notice, Tag, Modal } from '@/components/pipeline/ui';
import { api } from '@/lib/api';

const TABS = ['Organizations', 'Users', 'Settings'] as const;
type Tab = typeof TABS[number];

export default function AdminPageWrapper() { return <Suspense><AdminPage /></Suspense>; }

function AdminPage() {
  const router = useRouter(); const path = usePathname() || '';
  const seg = path.split('/')[2] || 'orgs';
  const orgId = seg === 'orgs' ? path.split('/')[3] || '' : '';
  const tab: Tab = seg === 'users' ? 'Users' : seg === 'settings' ? 'Settings' : 'Organizations';
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api.get<any>('/auth/me') });
  if (me && !(me as any).isSystemAdmin) return <PageContent><Notice kind="error">System admins only.</Notice></PageContent>;
  return (
    <PageContent>
      {orgId ? <OrgDetail id={orgId} /> : <>
      <h1 className="text-[24px] leading-8 text-[#161616] mb-4">{tab}</h1>
      {tab === 'Organizations' ? <Orgs /> : tab === 'Users' ? <Users meId={(me as any)?.id} /> : <Settings />}</>}
    </PageContent>
  );
}

function Issued({ v, onHide }: { v: { email: string; password: string } | null; onHide: () => void }) {
  if (!v) return null;
  return (
    <div className="border-l-4 border-[#0f62fe] bg-[#edf5ff] px-4 py-3 text-[14px] mb-4">
      <span className="font-mono">{v.email}</span> · temporary password <span className="font-mono font-semibold select-all">{v.password}</span>
      <button className="ml-3 text-[#0f62fe] hover:underline" onClick={() => navigator.clipboard?.writeText(v.password)}>Copy</button>
      <button className="ml-3 text-[#525252] hover:underline" onClick={onHide}>Hide</button>
    </div>
  );
}

function Orgs() {
  const qc = useQueryClient();
  const { data: orgs = [] } = useQuery({ queryKey: ['admin-orgs'], queryFn: () => api.get<any[]>('/admin/orgs') });
  const [f, setF] = useState({ name: '', ownerEmail: '' });
  const [open, setOpen] = useState(false);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const inv = () => { qc.invalidateQueries({ queryKey: ['admin-orgs'] }); qc.invalidateQueries({ queryKey: ['admin-users'] }); qc.invalidateQueries({ queryKey: ['tenants'] }); };
  const create = useMutation({ meta: { silent: true }, mutationFn: () => api.post<any>('/admin/orgs', f),
    onSuccess: (r: any) => { setIssued(r.tempPassword ? { email: r.ownerEmail, password: r.tempPassword } : null); setF({ name: '', ownerEmail: '' }); setOpen(false); inv(); } });
  const upd = useMutation({ mutationFn: ({ id, body }: any) => api.patch(`/admin/orgs/${id}`, body), onSuccess: inv });
  return (
    <div>
      <div className="flex items-center mb-3">
        <span className="text-[13px] text-[#525252] tabular-nums">{orgs.length} organizations</span>
        <div className="ml-auto"><Btn onClick={() => setOpen(o => !o)}>New organization</Btn></div>
      </div>
      {open && (
        <Modal title="New organization" onClose={() => setOpen(false)} onSubmit={() => create.mutate()} submitLabel="Create"
          submitDisabled={!f.name.trim() || !f.ownerEmail.trim() || create.isPending} error={(create.error as any)?.message}>
          <Input label="Name" id="o-name" value={f.name} onChange={(v: string) => setF({ ...f, name: v })} />
          <Input label="Owner email" id="o-owner" value={f.ownerEmail} onChange={(v: string) => setF({ ...f, ownerEmail: v })} />
        </Modal>
      )}
      <Issued v={issued} onHide={() => setIssued(null)} />
      <div className="bg-white border border-[#e0e0e0]">
        {orgs.map((o: any) => (
          <div key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 border-b border-[#e0e0e0] last:border-b-0">
            <div className="flex-1 min-w-[200px]">
              <Link href={`/admin/orgs/${o.id}`} className="text-[14px] text-[#0f62fe] hover:underline">{o.name}</Link>
              <div className="text-[12px] text-[#525252] truncate"><span className="font-mono">{o.owner || '—'}</span> · {o.members} member{o.members === 1 ? '' : 's'} · {o.projects} project{o.projects === 1 ? '' : 's'}</div>
            </div>
            {o.suspended && <Tag tone="red">Suspended</Tag>}
            <Btn kind="ghost" onClick={() => upd.mutate({ id: o.id, body: { suspended: !o.suspended } })}>{o.suspended ? 'Reactivate' : 'Suspend'}</Btn>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrgDetail({ id }: { id: string }) {
  const { data: o } = useQuery({ queryKey: ['admin-org', id], queryFn: () => api.get<any>(`/admin/orgs/${id}`) });
  if (!o) return null;
  const role = (r: string) => r[0] + r.slice(1).toLowerCase();
  return (
    <div>
      <div className="text-[13px] mb-1"><Link href="/admin/orgs" className="text-[#0f62fe] hover:underline">Organizations</Link></div>
      <h1 className="text-[24px] leading-8 text-[#161616] mb-4 flex items-center gap-3">{o.name}{o.suspended && <Tag tone="red">Suspended</Tag>}</h1>
      <div className="grid gap-6 xl:grid-cols-2">
        <div>
          <div className="text-[16px] text-[#161616] mb-2">Members <span className="text-[#525252] tabular-nums">{o.members.length}</span></div>
          <div className="bg-white border border-[#e0e0e0]">
            {o.members.map((m: any) => (
              <div key={m.userId} className="flex items-center gap-4 px-4 py-3 border-b border-[#e0e0e0] last:border-b-0">
                <div className="flex-1 min-w-0"><div className="text-[14px] text-[#161616] truncate">{m.name || m.email}</div><div className="text-[12px] text-[#525252] font-mono truncate">{m.email}</div></div>
                <span className="text-[13px] text-[#525252]">{role(m.role)}</span>
                {m.disabled && <Tag tone="red">Disabled</Tag>}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[16px] text-[#161616] mb-2">Projects <span className="text-[#525252] tabular-nums">{o.projects.length}</span></div>
          <div className="bg-white border border-[#e0e0e0]">
            {o.projects.map((p: any) => (
              <div key={p.id} className="flex items-center gap-4 px-4 py-3 border-b border-[#e0e0e0] last:border-b-0">
                <span className="flex-1 text-[14px] text-[#161616] truncate">{p.name}</span>
                <span className="text-[13px] text-[#525252] tabular-nums">{p.rules} rules</span>
              </div>
            ))}
            {!o.projects.length && <div className="px-4 py-3 text-[14px] text-[#525252]">No projects</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Users({ meId }: { meId?: string }) {
  const qc = useQueryClient();
  const { data: users = [] } = useQuery({ queryKey: ['admin-users'], queryFn: () => api.get<any[]>('/admin/users') });
  const [q, setQ] = useState('');
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const inv = () => qc.invalidateQueries({ queryKey: ['admin-users'] });
  const upd = useMutation({ meta: { silent: true }, mutationFn: ({ id, body }: any) => api.patch(`/admin/users/${id}`, body), onSuccess: () => { setErr(null); inv(); }, onError: (e: any) => setErr(e.message) });
  const { data: orgs = [] } = useQuery({ queryKey: ['admin-orgs'], queryFn: () => api.get<any[]>('/admin/orgs') });
  const move = useMutation({ meta: { silent: true }, mutationFn: ({ id, ...body }: any) => api.post(`/admin/users/${id}/move`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); qc.invalidateQueries({ queryKey: ['admin-orgs'] }); },
    onError: (e: any) => setErr(e?.message || 'Move failed') });
  const reset = useMutation({ mutationFn: (u: any) => api.post<any>(`/admin/users/${u.id}/reset-password`, {}).then((r: any) => ({ ...r, email: u.email })),
    onSuccess: (r: any) => setIssued({ email: r.email, password: r.tempPassword }) });
  const list = users.filter((u: any) => !q || u.email.toLowerCase().includes(q.toLowerCase()) || (u.name || '').toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-full max-w-[320px]"><Input id="u-q" value={q} onChange={setQ} placeholder="Search" /></div>
        <span className="text-[13px] text-[#525252] tabular-nums whitespace-nowrap">{list.length} users</span>
      </div>
      {err && <div className="mb-3"><Notice kind="error">{err}</Notice></div>}
      <Issued v={issued} onHide={() => setIssued(null)} />
      <div className="bg-white border border-[#e0e0e0]">
        {list.map((u: any) => {
          const self = u.id === meId;
          return (
            <div key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 border-b border-[#e0e0e0] last:border-b-0">
              <div className="flex-1 min-w-[200px]">
                <div className="text-[14px] text-[#161616]">{u.name || u.email}{self && <span className="ml-2 text-[12px] text-[#525252]">(you)</span>}{u.disabled && <span className="ml-2"><Tag tone="red">Disabled</Tag></span>}</div>
                <div className="text-[12px] text-[#525252] truncate font-mono">{u.email}</div>
              </div>
              <div className="w-[220px] flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <Dropdown value={u.orgs[0]?.id || ''} placeholder="No organization"
                    options={orgs.map((o: any) => ({ value: o.id, label: o.name }))}
                    onChange={v => v !== u.orgs[0]?.id && move.mutate({ id: u.id, workspaceId: v, role: u.orgs[0]?.role || 'MEMBER' })} />
                </div>
                {u.orgs[0] && <span className="text-[12px] text-[#525252] w-14">{String(u.orgs[0].role)[0] + String(u.orgs[0].role).slice(1).toLowerCase()}</span>}
                {u.orgs.length > 1 && <Tag tone="red">{u.orgs.length} orgs</Tag>}
              </div>
              <label className="flex items-center gap-2 text-[13px] text-[#525252]">
                System admin
                <button role="switch" aria-checked={u.isSystemAdmin} aria-label={`System admin ${u.email}`} disabled={self}
                  onClick={() => upd.mutate({ id: u.id, body: { isSystemAdmin: !u.isSystemAdmin } })}
                  className={`h-6 w-11 relative ${u.isSystemAdmin ? 'bg-[#161616]' : 'bg-[#a8a8a8]'} ${self ? 'cursor-not-allowed' : ''}`}>
                  <span className={`absolute top-1 h-4 w-4 bg-white ${u.isSystemAdmin ? 'left-6' : 'left-1'}`} />
                </button>
              </label>
              <div className="flex">
                <Btn kind="ghost" onClick={() => reset.mutate(u)}>Reset password</Btn>
                {!self && <Btn kind="ghost" onClick={() => upd.mutate({ id: u.id, body: { disabled: !u.disabled } })}>{u.disabled ? 'Enable' : 'Disable'}</Btn>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Settings() {
  const qc = useQueryClient();
  const { data: s } = useQuery({ queryKey: ['admin-settings'], queryFn: () => api.get<any>('/admin/settings') });
  const save = useMutation({ mutationFn: (patch: any) => api.put('/admin/settings', patch), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-settings'] }) });
  const [llm, setLlm] = useState<string | null>(null);
  if (!s) return null;
  return (
    <div className="bg-white border border-[#e0e0e0] max-w-[720px]">
      <div className="flex items-center gap-4 px-4 h-16 border-b border-[#e0e0e0]">
        <div className="flex-1 text-[14px] text-[#161616]">Self sign-up</div>
        <span className="text-[13px] text-[#525252]">{s.allowSignup !== false ? 'On' : 'Off'}</span>
        <button role="switch" aria-checked={s.allowSignup !== false} aria-label="Self sign-up" onClick={() => save.mutate({ allowSignup: s.allowSignup === false })}
          className={`h-6 w-11 relative ${s.allowSignup !== false ? 'bg-[#161616]' : 'bg-[#8d8d8d]'}`}>
          <span className={`absolute top-1 h-4 w-4 bg-white ${s.allowSignup !== false ? 'left-6' : 'left-1'}`} />
        </button>
      </div>
      <form className="flex items-end gap-3 px-4 py-4" onSubmit={e => { e.preventDefault(); if (llm !== null) save.mutate({ defaultLlm: llm }); }}>
        <div className="flex-1"><Input label="Default LLM for AI Agent rules" id="s-llm" value={llm ?? s.defaultLlm ?? ''} onChange={setLlm} placeholder="claude-sonnet-5-5" mono /></div>
        <Btn type="submit" disabled={llm === null || llm === (s.defaultLlm ?? '') || save.isPending}>Save</Btn>
      </form>
    </div>
  );
}
