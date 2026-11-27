'use client';
// Topics (เรื่อง): the business user's home in a project.
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Btn, Input, Modal, fmtTime } from '@/components/pipeline/ui';
import { usePerms } from '@/lib/perms';
import { useReasons } from '@/components/vocab/ReasonCodes';
import { CaseImport } from '@/components/test/CaseImport';

export default function TopicsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const perms = usePerms();
  const [open, setOpen] = useState(false);
  const sp = useSearchParams();
  useEffect(() => { if (sp?.get('new') === '1') { setOpen(true); router.replace(`/p/${projectId}/topics`); } }, [sp]); // eslint-disable-line react-hooks/exhaustive-deps
  const [f, setF] = useState({ name: '', goal: '', from: 'blank', description: '' });
  const { data: tpls = [] } = useQuery({ queryKey: ['topic-templates'], queryFn: () => api.get<any[]>('/platform/topics/templates'), enabled: open });
  const { data: topics = [], isFetched } = useQuery({ queryKey: ['topics', projectId], queryFn: () => api.get<any[]>(`/platform/topics?project_id=${projectId}`) });
  const create = useMutation({ meta: { silent: true }, mutationFn: () => f.from === 'blank' || f.from === 'steps' ? api.post<any>('/platform/topics', { projectId, name: f.name, goal: f.goal, shape: f.from === 'steps' ? 'steps' : 'questions' })
      : api.post<any>('/platform/topics/start', { projectId, name: f.name, ...(f.from === 'describe' ? { description: f.description } : { template: f.from }) }),
    onSuccess: (t: any) => { qc.invalidateQueries({ queryKey: ['topics', projectId] }); setOpen(false); router.push(`/p/${projectId}/topics/${t.id}`); } });

  // the start guide: what a new project needs, in order, each a way to do it, ticked when done
  const { data: words = [] } = useQuery({ queryKey: ['vocab', projectId], queryFn: () => api.get<any[]>(`/platform/vocabulary?project_id=${projectId}`) });
  const { data: reasons = [] } = useReasons(projectId);
  const { data: cases = [] } = useQuery({ queryKey: ['project-cases', projectId], queryFn: () => api.get<any[]>(`/platform/tests?project_id=${projectId}`) });
  const [casesOpen, setCasesOpen] = useState(false);
  const steps = [
    { done: (words as any[]).length > 0, name: 'Bring in sample data', go: () => router.push(`/p/${projectId}/vocabulary?import=1`), note: `${(words as any[]).length} words` },
    { done: (reasons as any[]).length > 0, name: 'Bring in reason codes', go: () => router.push(`/p/${projectId}/vocabulary/reasons?import=1`), note: `${(reasons as any[]).length} reason codes` },
    { done: (cases as any[]).length > 0, name: 'Bring in test cases with expected results', go: () => setCasesOpen(true), note: `${(cases as any[]).length} test cases` },
    { done: (topics as any[]).length > 0, name: 'Make the first topic', go: () => { setF({ name: '', goal: '', from: 'steps', description: '' }); setOpen(true); }, note: `${(topics as any[]).length} topics` },
  ];
  const showGuide = perms.write && isFetched && steps.some(x => !x.done);

  return (
    <div className="px-8 py-6">
      <PageHead title="Topics" sub={`${topics.length} topic${topics.length === 1 ? '' : 's'}`} actions={perms.write ? <Btn onClick={() => { setF({ name: '', goal: '', from: 'blank', description: '' }); setOpen(true); }}>New topic</Btn> : undefined} />
      {showGuide && (
        <ol aria-label="Start" className="bg-white border border-[#e0e0e0] mb-6">
          {steps.map((x, i) => (
            <li key={x.name} className="border-b border-[#e0e0e0] last:border-b-0">
              <button type="button" onClick={x.go} className="w-full flex items-center gap-4 px-5 h-14 text-left hover:bg-[#f4f4f4]">
                <span aria-hidden className={`w-5 h-5 shrink-0 flex items-center justify-center border ${x.done ? 'bg-[#198038] border-[#198038] text-white' : 'border-[#8d8d8d]'}`}>{x.done ? '✓' : ''}</span>
                <span className="w-6 text-[14px] text-[#525252] tabular-nums">{i + 1}</span>
                <span className={`flex-1 text-[16px] ${x.done ? 'text-[#525252]' : 'text-[#0f62fe]'}`}>{x.name}<span className="sr-only">{x.done ? ' (done)' : ''}</span></span>
                {x.done && <span className="text-[13px] text-[#525252] tabular-nums">{x.note}</span>}
              </button>
            </li>
          ))}
        </ol>
      )}
      {casesOpen && <CaseImport projectId={projectId} topicId={(topics as any[]).length === 1 ? (topics as any[])[0].id : undefined} onClose={() => setCasesOpen(false)} />}
      {isFetched && !topics.length && showGuide ? null : isFetched && !topics.length ? (
        <div className="bg-white border border-[#e0e0e0] px-8 py-12 text-center">
          <div className="text-[16px] text-[#161616]">No topics yet</div>
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
              <span className="text-[13px] text-[#525252] w-[110px] tabular-nums">{t.shape === 'steps' ? `${t.stages} step${t.stages === 1 ? '' : 's'} · ` : ''}{t.decisions} decision{t.decisions === 1 ? '' : 's'}</span>
              <span className={`text-[13px] w-[130px] tabular-nums ${!t.tests.total ? 'text-[#6f6f6f]' : t.tests.pass === t.tests.total ? 'text-[#198038]' : 'text-[#da1e28]'}`}>{t.tests.total ? `${t.tests.pass}/${t.tests.total} tests pass` : 'No tests'}</span>
              <span className="text-[13px] w-[100px] text-[#0043ce]">{t.inReview ? `${t.inReview} in review` : ''}</span>
              <span className="text-[12px] text-[#6f6f6f] w-[150px]">{fmtTime(t.updatedAt)}</span>
            </Link>
          ))}
        </div>
      )}
      {open && (
        <Modal title="New topic" onClose={() => setOpen(false)} onSubmit={() => create.mutate()} submitLabel={create.isPending ? 'Creating…' : 'Create'}
          submitDisabled={create.isPending || ((f.from === 'blank' || f.from === 'steps') && !f.name.trim()) || (f.from === 'describe' && !f.description.trim())} error={create.error ? String((create.error as any).message) : null}>
          <div role="radiogroup" aria-label="Start from" className="grid gap-px bg-[#e0e0e0] border border-[#e0e0e0] sm:grid-cols-2">
            {[{ key: 'blank', name: 'Empty topic', goal: 'Who qualifies · How much · Which one' }, { key: 'steps', name: 'Steps', goal: 'Policy → Income → Affordability → Score → Line → Verification → Final' }, { key: 'describe', name: 'Describe it', goal: 'Type what the topic decides' }, ...(tpls as any[]).map(t => ({ key: t.key, name: t.name, goal: `${t.decisions} decision${t.decisions === 1 ? "" : "s"} · ${t.terms} terms` }))].map(o => (
              <button key={o.key} type="button" role="radio" aria-checked={f.from === o.key} onClick={() => setF({ ...f, from: o.key })}
                className={`text-left p-4 ${f.from === o.key ? 'bg-[#edf5ff] outline outline-2 outline-[#0f62fe] -outline-offset-2' : 'bg-white hover:bg-[#f4f4f4]'}`}>
                <div className="text-[14px] text-[#161616]">{o.name}</div><div className="text-[12px] text-[#525252] mt-0.5">{o.goal}</div>
              </button>
            ))}
          </div>
          <Input id="tp-name" label={f.from === 'blank' || f.from === 'steps' ? 'Name' : 'Name (optional)'} value={f.name} onChange={(v: string) => setF({ ...f, name: v })} placeholder="Budget screening 2027" />
          {(f.from === 'blank' || f.from === 'steps') && <Input id="tp-goal" label="Goal" value={f.goal} onChange={(v: string) => setF({ ...f, goal: v })} placeholder="Fund the projects that matter most within the ceiling" />}
          {f.from === 'describe' && <div><label htmlFor="tp-desc" className="block text-[12px] text-[#525252] mb-1.5">What does this topic decide?</label>
            <textarea id="tp-desc" className="w-full h-24 px-3 py-2 bg-[#f4f4f4] border-b border-[#8d8d8d] text-[14px] outline-none focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder="Rank budget requests by impact and urgency and fund them until the ceiling is reached" /></div>}
        </Modal>
      )}
    </div>
  );
}
