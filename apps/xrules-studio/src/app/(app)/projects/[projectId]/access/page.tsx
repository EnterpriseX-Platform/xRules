'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageContent } from '@/components/layout/AppShell';
import { PageHead, Panel, Table, Td, Notice, Tag } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';
import { projectsApi, projectAccessApi } from '@/lib/api';
import { useAuth } from '@/lib/store';

const INHERIT = 'INHERIT';
const ROLE_OPTS = [
  { value: INHERIT, label: 'From tenant role' },
  { value: 'ADMIN', label: 'Admin', hint: 'settings, members' },
  { value: 'EDITOR', label: 'Editor', hint: 'create and edit' },
  { value: 'VIEWER', label: 'Viewer', hint: 'read only' },
];
const cap = (s?: string | null) => s ? s[0] + s.slice(1).toLowerCase() : '—';

export default function ProjectAccessPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const user = useAuth(s => s.user);
  const { data: p } = useQuery({ queryKey: ['project', projectId], queryFn: () => projectsApi.get(projectId) });
  const { data: members = [] } = useQuery({ queryKey: ['project-members', projectId], queryFn: () => projectAccessApi.members(projectId) });
  const [err, setErr] = useState<string | null>(null);
  const inv = () => { setErr(null); qc.invalidateQueries({ queryKey: ['project-members', projectId] }); qc.invalidateQueries({ queryKey: ['project', projectId] }); qc.invalidateQueries({ queryKey: ['projects'] }); };
  const vis = useMutation({ mutationFn: (v: string) => projectsApi.update(projectId, { visibility: v }), onSuccess: inv, onError: (e: any) => setErr(e.message) });
  const role = useMutation({ mutationFn: (v: { userId: string; role: string | null }) => projectAccessApi.setRole(projectId, v.userId, v.role), onSuccess: inv, onError: (e: any) => setErr(e.message) });
  const admin = p?.myRole === 'ADMIN';

  return (
    <PageContent>
      <PageHead title="Members & Access" sub={p ? `Who can see and change ${p.name}` : undefined} />
      {err && <div className="mb-4"><Notice kind="error">{err}</Notice></div>}
      <div className="space-y-4">
        <Panel title="Visibility">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { v: 'WORKSPACE', t: 'Everyone in the tenant', d: 'Members edit, viewers read. Project roles below can raise or lower that.' },
              { v: 'PRIVATE', t: 'Only people added here', d: 'Hidden from the tenant except owners, admins and the people given a project role.' },
            ].map(o => {
              const on = p?.visibility === o.v;
              return (
                <button key={o.v} type="button" disabled={!admin || vis.isPending} onClick={() => !on && vis.mutate(o.v)}
                  className={`text-left p-4 border ${on ? 'border-[#0f62fe] bg-[#edf5ff]' : 'border-[#e0e0e0] hover:bg-[#f4f4f4]'} disabled:cursor-default`}>
                  <div className="text-[14px] font-semibold">{o.t}</div>
                  <div className="text-[13px] text-[#525252] mt-1">{o.d}</div>
                </button>
              );
            })}
          </div>
          {!admin && p && <div className="mt-3"><Notice>Only project admins can change access. Your role here is {cap(p.myRole)}.</Notice></div>}
        </Panel>

        <Table head={['Name', 'Email', 'Tenant role', 'Project role', 'Effective']}>
          {members.map((m: any) => {
            const fixed = m.source === 'tenant-admin';
            return (
              <tr key={m.userId}>
                <Td>{m.name || '—'}{m.userId === user?.id && <span className="ml-2"><Tag tone="blue">you</Tag></span>}</Td>
                <Td mono>{m.email}</Td>
                <Td>{cap(m.tenantRole)}</Td>
                <Td className="w-60">
                  {fixed ? <span className="text-[#525252]">Admin (tenant {cap(m.tenantRole).toLowerCase()})</span>
                    : admin ? <Dropdown value={m.projectRole ?? INHERIT} options={ROLE_OPTS}
                        onChange={v => role.mutate({ userId: m.userId, role: v === INHERIT ? null : v })} />
                    : (m.projectRole ? cap(m.projectRole) : 'From tenant role')}
                </Td>
                <Td>{m.effectiveRole ? <Tag tone={m.effectiveRole === 'ADMIN' ? 'blue' : m.effectiveRole === 'EDITOR' ? 'green' : 'gray'}>{cap(m.effectiveRole)}</Tag> : <span className="text-[#6f6f6f]">No access</span>}</Td>
              </tr>
            );
          })}
        </Table>
      </div>
    </PageContent>
  );
}
