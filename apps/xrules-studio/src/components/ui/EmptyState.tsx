'use client';
// Generic empty state — icon in a tinted circle, headline, body, primary CTA.
// Usage:
//   <EmptyState icon={FlaskConical} title="No test suites yet"
//     body="Bind a rule to a dataset and run assertions in batch."
//     cta={<button className="btn-primary" onClick={...}>+ New suite</button>} />
import type { LucideIcon } from 'lucide-react';

type Tone = 'accent' | 'info' | 'mint' | 'warn';

const TONE_CLS: Record<Tone, string> = {
  accent: 'bg-accent/10 text-accent',
  info:   'bg-info/10 text-info',
  mint:   'bg-mint/10 text-mint',
  warn:   'bg-warn/10 text-warn',
};

export function EmptyState({
  icon: Icon,
  title,
  body,
  cta,
  tone = 'accent',
  hint,
  className,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  cta?: React.ReactNode;
  tone?: Tone;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`card p-12 text-center ${className || ''}`}>
      <div className="max-w-md mx-auto">
        <div className={`h-14 w-14 mx-auto rounded-full flex items-center justify-center mb-4 ${TONE_CLS[tone]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <h3 className="text-base font-medium text-text mb-1.5">{title}</h3>
        {body && <p className="text-xs text-subtle leading-relaxed mb-5">{body}</p>}
        {cta && <div className="flex justify-center">{cta}</div>}
        {hint && <div className="mt-5 pt-5 border-t border-border/40 text-[10px] font-mono text-subtle/70 leading-relaxed">{hint}</div>}
      </div>
    </div>
  );
}
