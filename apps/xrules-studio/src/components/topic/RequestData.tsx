'use client';
// "Request this data": ask a developer for a term the decision needs; until it arrives, test with a sample value.
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Input, Modal } from '@/components/pipeline/ui';

export function RequestData({ projectId, topicId, ruleId, className = '' }: { projectId: string; topicId?: string; ruleId?: string; className?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ term: '', note: '', sampleValue: '' });
  const [sent, setSent] = useState(false);
  const send = useMutation({ meta: { silent: true }, mutationFn: () => api.post('/platform/data-requests', { projectId, topicId, ruleId, ...f }),
    onSuccess: async () => {
      // the term exists right away so rules and tests can use it with the sample value
      const path = f.term.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      if (/^[a-z]/.test(path)) await api.post('/platform/vocabulary', { projectId, term: f.term.trim(), path, type: f.sampleValue && isNaN(Number(f.sampleValue.replace(/,/g, ''))) ? 'text' : 'number', description: 'Requested, not yet supplied' }).catch(() => {});
      qc.invalidateQueries({ queryKey: ['vocab', projectId] }); qc.invalidateQueries({ queryKey: ['home'] });
      setOpen(false); setSent(true);
    } });
  return (
    <>
      <button type="button" className={`h-8 px-2 text-[13px] text-[#0f62fe] hover:bg-[#e8e8e8] ${className}`} onClick={() => { setF({ term: '', note: '', sampleValue: '' }); setOpen(true); }}>{sent ? 'Requested · request more data' : 'Request data'}</button>
      {open && (
        <Modal title="Request data" onClose={() => setOpen(false)} onSubmit={() => send.mutate()} submitLabel="Send request" submitDisabled={!f.term.trim() || send.isPending} error={send.error ? String((send.error as any).message) : null}>
          <Input id="rd-term" label="Data you need" value={f.term} onChange={(v: string) => setF({ ...f, term: v })} placeholder="household income" />
          <Input id="rd-note" label="Where it comes from or why (optional)" value={f.note} onChange={(v: string) => setF({ ...f, note: v })} placeholder="From the registry, per household" />
          <Input id="rd-sample" label="Sample value to test with" value={f.sampleValue} onChange={(v: string) => setF({ ...f, sampleValue: v })} placeholder="250,000" />
        </Modal>
      )}
    </>
  );
}
