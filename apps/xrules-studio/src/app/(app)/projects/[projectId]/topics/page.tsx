'use client';
// Topics (เรื่อง): the business user's home in a project.
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Btn, Input, Modal, fmtTime } from '@/components/pipeline/ui';
import { usePerms } from '@/lib/perms';

export default function TopicsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const perms = usePerms();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', goal: '' });
  const { data: topics = [], isFetched } = useQuery({ queryKey: ['topics', projectId], queryFn: () => api.get<any[]>(`/platform/topics?project_id=${projectId}`) });
  const create = useMutation({ meta: { silent: true }, mutationFn: () => api.post<any>('/platform/topics', { projectId, ...f }),
    onSuccess: (t: any) => { qc.invalidateQueries({ queryKey: ['topics', projectId] }); setOpen(false); router.push(`/p/${projectId}/topics/${t.id}`); } });

  return (
    <div className="px-8 py-6">
      <PageHead title="Topics" sub={`${topics.length} topic${topics.length === 1 ? '' : 's'}`} actions={perms.write ? <Btn onClick={() => { setF({ name: '', goal: '' }); setOpen(true); }}>New topic</Btn> : undefined} />
      {isFetched && !topics.length ? (
        <div className="bg-white border border-[#e0e0e0] px-8 py-12 text-center">
          <div className="text-[16px] text-[#161616]">No topics yet</div>
          <div className="text-[14px] text-[#525252] mt-1">A topic holds the decisions for one business question, such as loan approval or budget screening.</div>
          {perms.write && <div className="mt-5 flex justify-center"><Btn onClick={() => setOpen(true)}>New topic</Btn></div>}
        </div>
      ) : (
        <div className="bg-white border border-[#e0e0e0]">
          {(topics as any[]).map(t => (
            <Link key={t.id} href={`/p/${projectId}/topics/${t.id}`} className="flex flex-wrap items-center gap-x-8 gap-y-1 px-5 py-4 border-b border-[#e0e0e0] last:border-b-0 hover:bg-[#f4f4f4]">
              <div className="flex-1 min-w-[240px]">
                <div className="text-[16px] text-[#161616]">{t.name}</div>
                {t.goal && <div className="text-[13px] text-[#525252] truncate">{t.goal}</div>}
              </div>
              <span className="text-[13px] text-[#525252] w-[110px] tabular-nums">{t.decisions} decision{t.decisions === 1 ? '' : 's'}</span>
              <span className={`text-[13px] w-[130px] tabular-nums ${!t.tests.total ? 'text-[#6f6f6f]' : t.tests.pass === t.tests.total ? 'text-[#198038]' : 'text-[#da1e28]'}`}>{t.tests.total ? `${t.tests.pass}/${t.tests.total} tests pass` : 'No tests'}</span>
              <span className="text-[13px] w-[100px] text-[#0043ce]">{t.inReview ? `${t.inReview} in review` : ''}</span>
              <span className="text-[12px] text-[#6f6f6f] w-[150px]">{fmtTime(t.updatedAt)}</span>
            </Link>
          ))}
        </div>
      )}
      {open && (
        <Modal title="New topic" onClose={() => setOpen(false)} onSubmit={() => create.mutate()} submitLabel="Create" submitDisabled={!f.name.trim() || create.isPending} error={create.error ? String((create.error as any).message) : null}>
          <Input id="tp-name" label="Name" value={f.name} onChange={(v: string) => setF({ ...f, name: v })} placeholder="Budget screening 2027" />
          <Input id="tp-goal" label="Goal" value={f.goal} onChange={(v: string) => setF({ ...f, goal: v })} placeholder="Fund the projects that matter most within the ceiling" />
        </Modal>
      )}
    </div>
  );
}
