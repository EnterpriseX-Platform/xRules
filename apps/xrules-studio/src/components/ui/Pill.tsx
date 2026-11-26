import { cn } from '@/lib/cn';

type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'mint' | 'subtle';

const TONE_CLS: Record<Tone, string> = {
  ok: 'pill-ok',
  warn: 'pill-warn',
  danger: 'pill-danger',
  info: 'pill-info',
  mint: 'pill-mint',
  subtle: 'pill-subtle',
};

export function Pill({
  tone = 'subtle',
  dot,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cn('pill', TONE_CLS[tone], className)}>
      {dot && <span className={cn('dot', `bg-${tone === 'subtle' ? 'subtle' : tone}`)} />}
      {children}
    </span>
  );
}

const WORD: Record<string, string> = { published: 'Live', active: 'Active', ok: 'OK', success: 'Succeeded', pass: 'Passed', draft: 'Draft', pending: 'Pending', running: 'Running',
  failed: 'Failed', error: 'Error', fail: 'Failed', revoked: 'Revoked', ready: 'Ready', info: 'Info', archived: 'Archived', retired: 'Retired', training: 'Training' };
export function StatusPill({ status }: { status: string }) {
  const s = String(status ?? '').toLowerCase();
  const w = WORD[s] || (s ? s[0].toUpperCase() + s.slice(1) : '—');
  const tone: any = ['published', 'active', 'ok', 'success', 'pass'].includes(s) ? 'ok' : ['draft', 'pending', 'running', 'training'].includes(s) ? 'warn' : ['failed', 'error', 'fail', 'revoked'].includes(s) ? 'danger' : s === 'ready' ? 'info' : 'subtle';
  return <Pill tone={tone}>{w}</Pill>;
}
