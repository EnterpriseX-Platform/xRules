'use client';
// "Calls" / "Used by" links between rules, decision flows and REST API operations — across projects of the tenant.
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

const flowHref = (f: any) => `/p/${f.project?.id || f.projectId}/flows/${f.id}`;
const ruleHref = (r: any) => `/p/${r.project?.id || r.projectId}/rules/${r.id}`;
const label = (x: any, home?: string) => `${x.name || x.slug}${x.project?.slug && x.project.slug !== home ? ` · ${x.project.name}` : ''}`;

function Chip({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="inline-flex items-center h-7 px-2.5 text-[13px] bg-[#f4f4f4] border border-[#e0e0e0] text-[#0f62fe] hover:bg-[#e8e8e8] whitespace-nowrap">{children}</Link>;
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-20 shrink-0 pt-1 text-[12px] text-[#525252]">{title}</div>
      <div className="flex flex-wrap gap-1.5 min-w-0">{children}</div>
    </div>
  );
}

const None = () => <span className="pt-1 text-[13px] text-[#6f6f6f]">—</span>;

/** For a rule: the flows and APIs that use it. */
export function RuleRelations({ ruleId, home }: { ruleId: string; home?: string }) {
  const { data } = useQuery({ queryKey: ['used-by', 'rule', ruleId], queryFn: () => api.get<any>(`/rules/${ruleId}/used-by`), enabled: !!ruleId });
  if (!data || (!data.flows.length && !data.operations.length)) return null;
  return (
    <div className="bg-white border border-[#e0e0e0] px-4 py-3 mb-4 space-y-2" data-testid="relations">
      <Row title="Used in">{data.flows.length ? data.flows.map((f: any) => <Chip key={f.id} href={flowHref(f)}>{label(f, home)}</Chip>) : <None />}</Row>
      {data.operations.length > 0 && <Row title="REST API">{data.operations.map((o: any) => <Chip key={o.id} href={`/apis/${o.spec.id}`}>{o.method} /api/…/{o.spec.basePath}/v{o.spec.version}{o.path}</Chip>)}</Row>}
    </div>
  );
}

/** For a flow: the rules and flows it calls, and who calls it. */
export function FlowRelations({ flowId, home }: { flowId: string; home?: string }) {
  const { data: uses } = useQuery({ queryKey: ['uses', flowId], queryFn: () => api.get<any>(`/flows/${flowId}/uses`), enabled: !!flowId });
  const { data: by } = useQuery({ queryKey: ['used-by', 'flow', flowId], queryFn: () => api.get<any>(`/flows/${flowId}/used-by`), enabled: !!flowId });
  if (!uses || !by) return null;
  const rules = uses.items.filter((x: any) => x.kind === 'rule');
  const flows = uses.items.filter((x: any) => x.kind === 'flow');
  if (!rules.length && !flows.length && !by.flows.length && !by.operations.length && !uses.missing.length) return null;
  return (
    <div className="px-6 py-2.5 bg-white border-b border-[#e0e0e0] space-y-1.5" data-testid="relations">
      {(rules.length > 0 || uses.missing.length > 0) && <Row title="Calls rules">{rules.map((r: any) => <Chip key={r.id} href={ruleHref(r)}>{label(r, home)}</Chip>)}{uses.missing.map((m: string) => <span key={m} className="inline-flex items-center h-7 px-2.5 text-[13px] bg-[#fff1f1] border border-[#ffd7d9] text-[#a2191f]">{m} — not found</span>)}</Row>}
      {flows.length > 0 && <Row title="Calls flows">{flows.map((f: any) => <Chip key={f.id} href={flowHref(f)}>{label(f, home)}</Chip>)}</Row>}
      {(by.flows.length > 0 || by.operations.length > 0) && <Row title="Used by">
        {by.flows.map((f: any) => <Chip key={f.id} href={flowHref(f)}>{label(f, home)}</Chip>)}
        {by.operations.map((o: any) => <Chip key={o.id} href={`/apis/${o.spec.id}`}>{o.method} {o.spec.basePath}{o.path}</Chip>)}
      </Row>}
    </div>
  );
}
