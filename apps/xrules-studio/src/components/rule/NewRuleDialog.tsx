'use client';
// Card-based picker for creating a new rule. Replaces the dropdown-style modal.
// 8 rule types, each with icon + tagline.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  Table, Network, BarChart3, Sigma, Code2, BookMarked, Bot, Brain, X,
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
  const [step, setStep] = useState<'type' | 'name'>('type');
  const [selected, setSelected] = useState<string>('DECISION_TABLE');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => rulesApi.create({ name, type: selected, description, projectId, folderId }),
    onSuccess: (rule: any) => {
      onCreated?.(rule);
      onClose();
      router.push(`/${window.location.pathname.split('/')[1]}/projects/${projectId}/rules/${rule.id}`);
    },
    onError: (e: any) => setError(e.message),
  });

  const selectedCard = TYPES.find(t => t.type === selected)!;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="card w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center">
          <div>
            <h2 className="text-xl font-bold">New Rule</h2>
            <p className="text-xs font-mono text-subtle mt-0.5">
              {step === 'type' ? 'Pick a rule kind' : `Naming your ${selectedCard.label}`}
            </p>
          </div>
          <button className="btn-ghost ml-auto" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>

        {step === 'type' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
              {TYPES.map((card) => {
                const Icon = card.icon;
                const isSelected = selected === card.type;
                return (
                  <button
                    key={card.type}
                    onClick={() => setSelected(card.type)}
                    className={cn(
                      'border rounded p-4 text-left transition-colors relative',
                      isSelected ? 'border-accent bg-accent/5 ring-2 ring-accent/30' : 'border-border hover:border-accent/40 hover:bg-muted/30',
                    )}
                  >
                    {card.recommended && (
                      <span className="absolute top-2 right-2 pill pill-info text-[8px]">RECOMMENDED</span>
                    )}
                    <div className={cn('h-9 w-9 rounded flex items-center justify-center mb-2 border', TONE_BG[card.tone])}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="font-medium text-sm">{card.label}</div>
                    <div className="font-mono text-[10px] text-subtle mb-1.5">{card.tagline}</div>
                    <div className="text-xs text-subtle leading-snug">{card.description}</div>
                  </button>
                );
              })}
            </div>
            <div className="px-6 py-3 border-t border-border flex justify-end gap-2">
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={() => setStep('name')}>Continue →</button>
            </div>
          </>
        )}

        {step === 'name' && (
          <form className="p-6 space-y-4" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded">
              <div className={cn('h-9 w-9 rounded flex items-center justify-center border', TONE_BG[selectedCard.tone])}>
                <selectedCard.icon className="h-4 w-4" />
              </div>
              <div>
                <div className="font-medium text-sm">{selectedCard.label}</div>
                <div className="font-mono text-[10px] text-subtle">{selectedCard.tagline}</div>
              </div>
              <button type="button" className="btn-ghost text-xs ml-auto" onClick={() => setStep('type')}>Change</button>
            </div>
            <div>
              <label className="label-section block mb-1.5">Name</label>
              <input required className="input w-full" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              <p className="text-[10px] font-mono text-subtle mt-1">Slug + alias auto-generated. Both editable later.</p>
            </div>
            <div>
              <label className="label-section block mb-1.5">Description (optional)</label>
              <textarea className="input w-full h-20 py-2" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            {error && <div className="pill pill-danger">{error}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-ghost" onClick={() => setStep('type')}>← Back</button>
              <button type="submit" className="btn-primary disabled:opacity-50" disabled={mut.isPending || !name}>
                {mut.isPending ? 'Creating…' : 'Create rule →'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
