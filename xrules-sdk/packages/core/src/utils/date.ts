export function now(): Date {
  return new Date();
}

export function formatDate(date: Date, format: string = 'ISO'): string {
  if (format === 'ISO') {
    return date.toISOString();
  }
  return date.toLocaleString();
}

export function parseDate(dateString: string): Date {
  return new Date(dateString);
}

export function isValidDate(date: unknown): date is Date {
  return date instanceof Date && !isNaN(date.getTime());
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function diffInDays(date1: Date, date2: Date): number {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
