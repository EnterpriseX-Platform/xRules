export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <rect x="2" y="2" width="28" height="28" rx="7" fill="rgb(var(--c-accent))" />
      <path
        d="M10 10 L16 16 M22 10 L10 22 M16 16 L22 22"
        stroke="rgb(var(--c-accent-fg))"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
