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

export function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === 'published' || s === 'active' || s === 'ok' || s === 'success' || s === 'pass') {
    return <Pill tone="ok" dot>{s}</Pill>;
  }
  if (s === 'draft' || s === 'pending' || s === 'running') {
    return <Pill tone="warn" dot>{s}</Pill>;
  }
  if (s === 'failed' || s === 'error' || s === 'fail' || s === 'revoked') {
    return <Pill tone="danger" dot>{s}</Pill>;
  }
  if (s === 'ready' || s === 'info') {
    return <Pill tone="info" dot>{s}</Pill>;
  }
  return <Pill tone="subtle" dot>{s}</Pill>;
}
