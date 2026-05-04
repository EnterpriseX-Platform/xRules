'use client';
// Templates library — pre-built starter rules importable into the current project.
// Users browse cards, preview definition, click "Use template" → creates a new rule.
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { BookOpen, Sparkles } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { Pill } from '@/components/ui/Pill';
import { rulesApi } from '@/lib/api';
import { TEMPLATES, type Template } from '@/lib/templates';

const TYPE_TONE: Record<string, any> = {
  DECISION_TABLE: 'info',
  DECISION_TREE: 'mint',
  SCORECARD: 'accent',
  FORMULA: 'warn',
  SCRIPT: 'subtle',
  LOOKUP: 'subtle',
  AI_AGENT: 'accent',
  MODEL_CALL: 'danger',
};

export default function TemplatesPage() {
  const { tenant, projectId } = useParams<{ tenant: string; projectId: string }>();
  const router = useRouter();
  const [category, setCategory] = useState<string>('all');

  const filtered = TEMPLATES.filter(t => category === 'all' || t.category === category);
  const categories = Array.from(new Set(TEMPLATES.map(t => t.category)));

  const useTemplate = useMutation({
    mutationFn: (tpl: Template) => rulesApi.create({
      name: tpl.name,
      type: tpl.type,
      description: tpl.description,
      definition: tpl.definition,
      input_schema: tpl.inputSchema,
      output_schema: tpl.outputSchema,
      projectId,
    }),
    onSuccess: (rule: any) => router.push(`/${tenant}/projects/${projectId}/rules/${rule.slug || rule.id}`),
  });

  return (
    <PageContent>
      <PageHeader
        title="Templates"
        description="Pre-built rules you can drop into your project. Production-ready starting points."
        stats={[{ label: 'Templates', value: TEMPLATES.length }]}
      />

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="label-section mr-1">Category</span>
        <button onClick={() => setCategory('all')} className={`pill border ${category === 'all' ? 'bg-accent/15 text-accent border-accent/40' : 'bg-transparent text-subtle border-border'}`}>All</button>
        {categories.map(c => (
          <button key={c} onClick={() => setCategory(c)} className={`pill border ${category === c ? 'bg-accent/15 text-accent border-accent/40' : 'bg-transparent text-subtle border-border'}`}>
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(tpl => (
          <div key={tpl.slug} className="card p-4 flex flex-col">
            <div className="flex items-start justify-between mb-2">
              <Pill tone={TYPE_TONE[tpl.type] || 'subtle'}>{tpl.type.replace('_', ' ')}</Pill>
              <Pill tone="subtle">{tpl.category}</Pill>
            </div>
            <h3 className="font-bold text-base mb-1">{tpl.name}</h3>
            <p className="text-xs text-subtle leading-snug mb-4 flex-1">{tpl.description}</p>
            <div className="flex items-center justify-between border-t border-border/50 pt-3 mt-auto">
              <span className="font-mono text-[10px] text-subtle">{Object.keys(tpl.inputSchema?.properties || {}).length} inputs · {Object.keys(tpl.outputSchema?.properties || {}).length} outputs</span>
              <button
                className="btn-primary text-xs"
                onClick={() => useTemplate.mutate(tpl)}
                disabled={useTemplate.isPending}
              >
                <Sparkles className="h-3 w-3" />
                Use template
              </button>
            </div>
          </div>
        ))}
      </div>
    </PageContent>
  );
}
