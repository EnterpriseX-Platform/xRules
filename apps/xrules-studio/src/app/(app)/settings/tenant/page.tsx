'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageContent } from '@/components/layout/AppShell';
import { PageHead, Panel, Table, Td, Btn, Tabs, Input, Notice, Tag } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';
import { tenantApi, api } from '@/lib/api';
import { useAuth } from '@/lib/store';
import { OrgTabs } from '@/components/layout/OrgTabs';

const ROLE_OPTS = [
  { value: 'OWNER', label: 'Owner', hint: 'full control' },
  { value: 'ADMIN', label: 'Admin', hint: 'members, all projects' },
  { value: 'INTEGRATOR', label: 'Integrator', hint: 'rules + Integration' },
  { value: 'MEMBER', label: 'Member', hint: 'rules and flows' },
  { value: 'VIEWER', label: 'Viewer', hint: 'read only' },
];
const roleLabel = (r: string) => ROLE_OPTS.find(o => o.value === r)?.label ?? r;

export default function TenantSettingsPageWrapper() {
  return <Suspense><TenantSettingsPage /></Suspense>;
}

function TenantSettingsPage() {
  const sp = useSearchParams();
  const tab = sp.get('tab') === 'Members' ? 'Members' : sp.get('tab') === 'Roles' ? 'Roles' : 'General';
  const { data: t } = useQuery({ queryKey: ['tenant'], queryFn: tenantApi.current });
  const admin = t && (t.role === 'OWNER' || t.role === 'ADMIN');
  return (
    <PageContent>
      <OrgTabs title={t?.name} />
      <div>{t && (tab === 'General' ? <General t={t} admin={!!admin} /> : tab === 'Roles' ? <Roles /> : <Members me={t} admin={!!admin} />)}</div>
    </PageContent>
  );
}

function General({ t, admin }: { t: any; admin: boolean }) {
  const qc = useQueryClient();
  const setWorkspace = useAuth(s => s.setWorkspace);
  const [f, setF] = useState({ name: t.name, description: t.description ?? '' });
  useEffect(() => setF({ name: t.name, description: t.description ?? '' }), [t.name, t.description]);
  const save = useMutation({
    mutationFn: () => tenantApi.update(f),
    onSuccess: (u: any) => { setWorkspace({ id: u.id, slug: u.slug, name: u.name }); qc.invalidateQueries({ queryKey: ['tenant'] }); qc.invalidateQueries({ queryKey: ['tenants'] }); },
  });
  const dirty = f.name !== t.name || f.description !== (t.description ?? '');
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,640px)_1fr] gap-4">
      <Panel title="Details">
        <div className="space-y-4">
          <Input label="Name" id="t-name" value={f.name} onChange={(v: string) => setF({ ...f, name: v })} />
          <Input label="Description" id="t-desc" value={f.description} onChange={(v: string) => setF({ ...f, description: v })} />
          <div>
            <div className="text-[12px] text-[#525252] mb-1">Slug</div>
            <div className="font-mono text-[14px]">{t.slug}</div>
          </div>
          {save.error && <Notice kind="error">{(save.error as any).message}</Notice>}
          {save.isSuccess && !dirty && <Notice kind="success">Saved</Notice>}
          {admin ? <Btn disabled={!dirty || save.isPending} onClick={() => save.mutate()}>Save</Btn>
            : <Notice>Only owners and admins can change these details.</Notice>}
        </div>
      </Panel>
      <Panel title="Summary">
        <dl className="grid grid-cols-[160px_1fr] gap-y-3 text-[14px]">
          <dt className="text-[#525252]">Your role</dt><dd>{roleLabel(t.role)}</dd>
          <dt className="text-[#525252]">Projects</dt><dd className="tabular-nums">{t.projectCount}</dd>
          <dt className="text-[#525252]">Members</dt><dd className="tabular-nums">{t.memberCount}</dd>
          <dt className="text-[#525252]">API keys</dt><dd className="tabular-nums">{t.apiKeyCount}</dd>
          <dt className="text-[#525252]">Gateway prefix</dt><dd className="font-mono text-[13px] break-all">/api/{t.slug}/&#123;basePath&#125;/v&#123;n&#125;</dd>
          <dt className="text-[#525252]">Created</dt><dd>{new Date(t.createdAt).toLocaleDateString('en-GB')}</dd>
        </dl>
      </Panel>
    </div>
  );
}

function Members({ me, admin }: { me: any; admin: boolean }) {
  const qc = useQueryClient();
  const user = useAuth(s => s.user);
  const { data: members = [] } = useQuery({ queryKey: ['tenant-members'], queryFn: tenantApi.members });
  const inv = () => { qc.invalidateQueries({ queryKey: ['tenant-members'] }); qc.invalidateQueries({ queryKey: ['tenant'] }); };
  const [add, setAdd] = useState({ email: '', role: 'MEMBER' });
  const [err, setErr] = useState<string | null>(null);
  const onErr = (e: any) => setErr(e.message);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const addM = useMutation({ mutationFn: () => tenantApi.addMember(add), onSuccess: (m: any) => { setIssued(m?.tempPassword ? { email: m.email, password: m.tempPassword } : null); setAdd({ email: '', role: 'MEMBER' }); setErr(null); inv(); }, onError: onErr });
  const approveM = useMutation({ mutationFn: (v: { userId: string; canApprove: boolean }) => api.put(`/tenant/members/${v.userId}`, { canApprove: v.canApprove }), onSuccess: () => { setErr(null); inv(); }, onError: onErr });
  const roleM = useMutation({ mutationFn: (v: { userId: string; role: string }) => tenantApi.setRole(v.userId, v.role), onSuccess: () => { setErr(null); inv(); }, onError: onErr });
  const delM = useMutation({ mutationFn: (userId: string) => tenantApi.removeMember(userId), onSuccess: () => { setErr(null); inv(); }, onError: onErr });
  const opts = me.role === 'OWNER' ? ROLE_OPTS : ROLE_OPTS.filter(o => o.value !== 'OWNER');

  return (
    <div className="space-y-4">
      {admin && (
        <Panel title="Add member">
          <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); if (add.email.trim()) addM.mutate(); }}>
            <div className="flex-1 min-w-[240px]"><Input label="Email" id="m-email" value={add.email} onChange={(v: string) => setAdd({ ...add, email: v })} placeholder="name@agency.go.th" /></div>
            <div className="w-56">
              <div className="text-[12px] text-[#525252] mb-1">Role</div>
              <Dropdown id="m-role" value={add.role} options={opts} onChange={v => setAdd({ ...add, role: v })} />
            </div>
            <Btn type="submit" disabled={!add.email.trim() || addM.isPending}>Add</Btn>
          </form>
          {issued && (
            <div className="mt-3 border-l-4 border-[#0f62fe] bg-[#edf5ff] px-4 py-3 text-[14px]">
              New account <span className="font-mono">{issued.email}</span> · temporary password <span className="font-mono font-semibold select-all">{issued.password}</span>
              <button type="button" className="ml-3 text-[#0f62fe] hover:underline" onClick={() => navigator.clipboard?.writeText(issued.password)}>Copy</button>
              <button type="button" className="ml-3 text-[#525252] hover:underline" onClick={() => setIssued(null)}>Hide</button>
            </div>
          )}
        </Panel>
      )}
      {err && <Notice kind="error">{err}</Notice>}
      <div className="bg-white border border-[#e0e0e0]">
        {members.map((m: any) => {
          const self = m.userId === user?.id;
          const canEdit = admin && (me.role === 'OWNER' || m.role !== 'OWNER');
          const always = m.role === 'OWNER' || m.role === 'ADMIN';
          return (
            <div key={m.userId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 border-b border-[#e0e0e0] last:border-b-0">
              <div className="flex-1 min-w-[200px]">
                <div className="text-[14px] text-[#161616]">{m.name || m.email}{self && <span className="ml-2 text-[12px] text-[#525252]">(you)</span>}</div>
                <div className="text-[12px] text-[#525252] font-mono truncate">{m.email}</div>
              </div>
              <div className="w-[150px]">{canEdit && !self ? <Dropdown value={m.role} options={opts} onChange={v => v !== m.role && roleM.mutate({ userId: m.userId, role: v })} /> : <span className="text-[14px]">{roleLabel(m.role)}</span>}</div>
              {!always && (canEdit ? <label className="flex items-center gap-2 text-[13px] text-[#525252] cursor-pointer"><input type="checkbox" className="h-4 w-4 accent-[#161616]" aria-label={`Approver ${m.email}`} checked={!!m.canApprove} onChange={e => approveM.mutate({ userId: m.userId, canApprove: e.target.checked })} />Approver</label>
                : m.canApprove ? <span className="text-[13px] text-[#525252]">Approver</span> : null)}
              {(canEdit || self) && <Btn kind="ghost" onClick={() => delM.mutate(m.userId)}>{self ? 'Leave' : 'Remove'}</Btn>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const CAN: [string, (boolean | 'flag')[]][] = [
  // Owner, Admin, Integrator, Member, Viewer
  ['View rules, flows and results',            [true, true, true, true, true]],
  ['Create and edit rules and flows',          [true, true, true, true, false]],
  ['Publish and release',                      [true, true, true, true, false]],
  ['Approve changes',                          [true, true, 'flag', 'flag', false]],
  ['REST APIs, triggers, data sets, connections', [true, true, true, false, false]],
  ['Projects and project access',              [true, true, false, false, false]],
  ['Members, API keys, webhooks',              [true, true, false, false, false]],
  ['Organization details, add owners',         [true, false, false, false, false]],
];
function Roles() {
  return (
    <div className="bg-white border border-[#e0e0e0] overflow-x-auto">
      <table className="w-full min-w-[520px] text-[14px]">
        <thead><tr className="h-11 border-b border-[#e0e0e0] text-left text-[12px] text-[#525252]">
          <th className="px-4 font-normal">Permission</th>
          {ROLE_OPTS.map(r => <th key={r.value} className="px-3 font-normal text-center w-[76px]">{r.label}</th>)}
        </tr></thead>
        <tbody>
          {CAN.map(([what, v]) => (
            <tr key={what} className="h-11 border-b border-[#f4f4f4]">
              <td className="px-4 text-[#161616]">{what}</td>
              {v.map((ok, i) => <td key={i} className="text-center">{ok === 'flag' ? <span className="text-[12px] text-[#525252]">if Approver</span> : ok ? <span className="text-[#161616]">✓</span> : <span className="text-[#c6c6c6]">—</span>}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
