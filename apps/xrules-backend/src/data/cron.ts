// Minimal 5-field cron matcher (minute hour day-of-month month day-of-week).
// Supports *, numbers, lists (1,2), ranges (1-5) and steps (*/15, 1-30/5).
function fieldMatches(field: string, value: number, min: number, max: number): boolean {
  return field.split(',').some(part => {
    const [range, stepStr] = part.split('/');
    const step = stepStr ? parseInt(stepStr, 10) : 1;
    let lo = min, hi = max;
    if (range !== '*') {
      const [a, b] = range.split('-');
      lo = parseInt(a, 10); hi = b !== undefined ? parseInt(b, 10) : (stepStr ? max : lo);
    }
    if (Number.isNaN(lo) || Number.isNaN(hi)) return false;
    return value >= lo && value <= hi && (value - lo) % step === 0;
  });
}

export function cronMatches(expr: string, d: Date): boolean {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return false;
  const dow = d.getDay();
  return fieldMatches(f[0], d.getMinutes(), 0, 59)
    && fieldMatches(f[1], d.getHours(), 0, 23)
    && fieldMatches(f[2], d.getDate(), 1, 31)
    && fieldMatches(f[3], d.getMonth() + 1, 1, 12)
    && (fieldMatches(f[4], dow, 0, 7) || (dow === 0 && fieldMatches(f[4], 7, 0, 7)));
}

export function nextRun(expr: string, from = new Date(), horizonMin = 60 * 24 * 32): Date | null {
  const d = new Date(from); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() + 1);
  for (let i = 0; i < horizonMin; i++) {
    if (cronMatches(expr, d)) return d;
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}
