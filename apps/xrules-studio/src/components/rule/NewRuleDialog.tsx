'use client';
// Card-based picker for creating a new rule. Replaces the dropdown-style modal.
// 8 rule types, each with icon + tagline.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  Table, Network, BarChart3, Sigma, Code2, BookMarked, Bot, Brain, Workflow, X,
} from 'lucide-react';
import { rulesApi } from '@/lib/api';
import { cn } from '@/lib/cn';

interface RuleTypeCard {
  type: string;
  label: string;
  tagline: string;
  description: string;
  icon: any;
  tone: string;
  recommended?: boolean;
}

const TYPES: RuleTypeCard[] = [
  {
    type: 'DECISION_TABLE', label: 'Decision Table', tagline: 'if-then grid',
    description: 'Map conditions to outputs in a tabular grid. Best for structured business rules.',
    icon: Table, tone: 'info', recommended: true,
  },
  {
    type: 'DECISION_TREE', label: 'Decision Tree', tagline: 'branching logic',
    description: 'Visual IF / THEN / ELSE branching. Good for step-by-step decisions.',
    icon: Network, tone: 'mint',
  },
  {
    type: 'SCORECARD', label: 'Scorecard', tagline: 'weighted scoring',
    description: 'Sum-of-points across attributes. Ideal for credit / fraud / propensity scoring.',
    icon: BarChart3, tone: 'accent',
  },
  {
    type: 'FORMULA', label: 'Formula', tagline: 'expression',
    description: 'Single expression returns a value. Lightweight calculations.',
    icon: Sigma, tone: 'warn',
  },
  {
    type: 'SCRIPT', label: 'Scripting Rule', tagline: 'JavaScript',
    description: 'Sandboxed JS with full programmatic logic. For edge cases and custom flows.',
    icon: Code2, tone: 'subtle',
  },
  {
    type: 'LOOKUP', label: 'Lookup Table', tagline: 'key → value',
    description: 'Primary-key based reference data. Currency rates, country mappings, etc.',
    icon: BookMarked, tone: 'subtle',
  },
  {
    type: 'AI_AGENT', label: 'AI Agent', tagline: 'LLM-backed',
    description: 'Use a language model with prompt + structured output schema for fuzzy decisions.',
    icon: Bot, tone: 'accent',
  },
  {
    type: 'RULE_FLOW', label: 'Rule Flow', tagline: 'visual orchestration',
    description: 'Chain rules together visually — input → call rules → branch / map → output. Sync, fast.',
    icon: Workflow, tone: 'mint',
  },
  {
    type: 'MODEL_CALL', label: 'Model Call', tagline: 'ML / PMML',
    description: 'Call an uploaded ML or PMML model artifact. Score with trained predictors.',
    icon: Brain, tone: 'danger',
  },
];

const TONE_BG: Record<string, string> = {
  info:    'bg-info/10 text-info border-info/30',
  mint:    'bg-mint/10 text-mint border-mint/30',
  accent:  'bg-accent/10 text-accent border-accent/30',
  warn:    'bg-warn/10 text-warn border-warn/30',
  danger:  'bg-danger/10 text-danger border-danger/30',
  subtle:  'bg-muted text-text border-border',
};

export function NewRuleDialog({
  projectId, folderId, onClose, onCreated,
}: {
  projectId: string;
  folderId?: string | null;
  onClose: () => void;
  onCreated?: (rule: any) => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>('DECISION_TABLE');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => rulesApi.create({ name, type: selected, description, projectId, folderId }),
    onSuccess: (rule: any) => {
      onCreated?.(rule);
      onClose();
      router.push(`/p/${projectId}/rules/${rule.id}`);
    },
    onError: (e: any) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <form className="bg-white w-full max-w-[560px] max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) mut.mutate(); }}>
        <div className="px-6 h-14 flex items-center border-b border-[#e0e0e0]">
          <h2 className="text-[20px] text-[#161616]">New rule</h2>
          <button type="button" className="ml-auto h-8 w-8 flex items-center justify-center hover:bg-[#e8e8e8]" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="nr-name" className="block text-[12px] text-[#525252]">Name</label>
            <input id="nr-name" required className="input w-full" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <div className="text-[12px] text-[#525252]">Type</div>
            <div className="border border-[#e0e0e0]" role="radiogroup" aria-label="Rule type">
              {TYPES.map((card) => {
                const Icon = card.icon;
                const on = selected === card.type;
                return (
                  <button type="button" key={card.type} role="radio" aria-checked={on} onClick={() => setSelected(card.type)}
                    className={cn('w-full flex items-center gap-3 px-3 h-12 text-left border-b border-[#e0e0e0] last:border-b-0',
                      on ? 'bg-[#e0e0e0]' : 'hover:bg-[#f4f4f4]')}>
                    <Icon className="h-4 w-4 shrink-0 text-[#525252]" />
                    <span className={cn('text-[14px] text-[#161616] w-[120px] shrink-0', on && 'font-semibold')}>{card.label}</span>
                    <span className="text-[13px] text-[#525252] truncate">{card.tagline}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="nr-desc" className="block text-[12px] text-[#525252]">Description</label>
            <textarea id="nr-desc" rows={2} className="input w-full py-2" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {error && <div className="text-[13px] text-[#da1e28]">{error}</div>}
        </div>
        <div className="flex border-t border-[#e0e0e0]">
          <button type="button" className="flex-1 h-14 text-left px-4 text-[14px] bg-[#393939] text-white hover:bg-[#4c4c4c]" onClick={onClose}>Cancel</button>
          <button type="submit" className="flex-1 h-14 text-left px-4 text-[14px] bg-[#0f62fe] text-white hover:bg-[#0353e9] disabled:bg-[#c6c6c6]" disabled={mut.isPending || !name.trim()}>Create</button>
        </div>
      </form>
    </div>
  );
}
