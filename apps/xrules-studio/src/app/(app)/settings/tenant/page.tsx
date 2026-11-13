'use client';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageContent } from '@/components/layout/AppShell';
import { PageHead, Panel, Table, Td, Btn, Tabs, Input, Notice, Tag } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';
import { tenantApi } from '@/lib/api';
import { useAuth } from '@/lib/store';

const ROLE_OPTS = [
  { value: 'OWNER', label: 'Owner', hint: 'full control' },
  { value: 'ADMIN', label: 'Admin', hint: 'members, all projects' },
  { value: 'MEMBER', label: 'Member', hint: 'create and edit' },
  { value: 'VIEWER', label: 'Viewer', hint: 'read only' },
];
const roleLabel = (r: string) => ROLE_OPTS.find(o => o.value === r)?.label ?? r;

export default function TenantSettingsPage() {
  const [tab, setTab] = useState('General');
  const { data: t } = useQuery({ queryKey: ['tenant'], queryFn: tenantApi.current });
  const admin = t && (t.role === 'OWNER' || t.role === 'ADMIN');
  return (
    <PageContent>
      <PageHead title={t?.name ?? 'Tenant'} sub={t ? <span className="font-mono text-[13px]">{t.slug}</span> : null} />
      <Tabs tabs={['General', 'Members']} value={tab} onChange={setTab} />
      <div>{t && (tab === 'General' ? <General t={t} admin={!!admin} /> : <Members me={t} admin={!!admin} />)}</div>
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
            : <Notice>Only owners and admins can change tenant details.</Notice>}
        </div>
      </Panel>
      <Panel title="Tenant facts">
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
  const addM = useMutation({ mutationFn: () => tenantApi.addMember(add), onSuccess: () => { setAdd({ email: '', role: 'MEMBER' }); setErr(null); inv(); }, onError: onErr });
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
          <div className="text-[12px] text-[#525252] mt-2">The person must already have an xRules account.</div>
        </Panel>
      )}
      {err && <Notice kind="error">{err}</Notice>}
      <Table head={['Name', 'Email', 'Role', 'Joined', '']}>
        {members.map((m: any) => {
          const self = m.userId === user?.id;
          const canEdit = admin && (me.role === 'OWNER' || m.role !== 'OWNER');
          return (
            <tr key={m.userId}>
              <Td>{m.name || '—'}{self && <span className="ml-2"><Tag tone="blue">you</Tag></span>}</Td>
              <Td mono>{m.email}</Td>
              <Td className="w-56">{canEdit ? <Dropdown value={m.role} options={opts} onChange={v => v !== m.role && roleM.mutate({ userId: m.userId, role: v })} /> : roleLabel(m.role)}</Td>
              <Td>{new Date(m.joinedAt).toLocaleDateString('en-GB')}</Td>
              <Td className="text-right">
                {(canEdit || self) && <Btn kind="ghost" onClick={() => delM.mutate(m.userId)}>{self ? 'Leave' : 'Remove'}</Btn>}
              </Td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
