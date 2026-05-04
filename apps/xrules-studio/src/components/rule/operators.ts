// DR-compatible operator catalog (20 operators).
// Each operator defines: code (verbatim), label, requires value(s), applicable types.
export interface OperatorSpec {
  code: string;
  label: string;
  argCount: 0 | 1 | 2;          // 0 = no value (NULL/!NULL/ELSE/ANY), 1 = single, 2 = range
  description: string;
}

export const OPERATORS: OperatorSpec[] = [
  { code: 'ANY',     label: 'any value',      argCount: 0, description: 'matches anything' },
  { code: '=',       label: 'equals',         argCount: 1, description: 'value equals' },
  { code: '!=',      label: 'not equals',     argCount: 1, description: 'value differs' },
  { code: 'IN',      label: 'in list',        argCount: 1, description: 'value is in array' },
  { code: '!IN',     label: 'not in list',    argCount: 1, description: 'value is not in array' },
  { code: '>=',      label: '≥',         argCount: 1, description: 'greater or equal' },
  { code: '>',       label: '>',              argCount: 1, description: 'greater than' },
  { code: '<=',      label: '≤',         argCount: 1, description: 'less or equal' },
  { code: '<',       label: '<',              argCount: 1, description: 'less than' },
  { code: 'BTW',     label: 'between',        argCount: 2, description: 'closed range [lo, hi]' },
  { code: 'BTW LO',  label: 'between (lo open)',  argCount: 2, description: '(lo, hi]' },
  { code: 'BTW RO',  label: 'between (hi open)',  argCount: 2, description: '[lo, hi)' },
  { code: '!BTW',    label: 'not between',    argCount: 2, description: 'outside [lo, hi]' },
  { code: 'NULL',    label: 'is null',        argCount: 0, description: 'value is null/missing' },
  { code: '!NULL',   label: 'not null',       argCount: 0, description: 'value present' },
  { code: 'C TXT',   label: 'contains text',  argCount: 1, description: 'string contains substring' },
  { code: 'C IN',    label: 'contains in',    argCount: 1, description: 'array contains value' },
  { code: '!C IN',   label: 'not contains in',argCount: 1, description: 'array does not contain' },
  { code: 'EQ ARR',  label: 'array equals',   argCount: 1, description: 'arrays element-equal' },
  { code: 'ELSE',    label: 'else',           argCount: 0, description: 'fallback row when no row matches' },
];

export const HIT_POLICIES = [
  { code: 'STANDARD',     label: 'Standard',     description: 'returns all matches in order' },
  { code: 'FIRST_MATCH',  label: 'First Match',  description: 'returns first match only' },
  { code: 'ARRAY',        label: 'Array',        description: 'aggregates matches into arrays' },
  { code: 'EVALUATE_ALL', label: 'Evaluate All', description: 'returns all rows + _match flag' },
];

// Compact pretty-print — used inside cells: "BTW 1000 AND 5000"
export function formatCellExpression(operator: string, args: any[]): string {
  if (operator === 'ANY' || operator === 'ELSE' || operator === 'NULL' || operator === '!NULL') return operator.toLowerCase();
  if (operator === 'BTW' || operator === 'BTW LO' || operator === 'BTW RO' || operator === '!BTW') {
    return `${operator} ${args[0] ?? ''} AND ${args[1] ?? ''}`;
  }
  return `${operator} ${args[0] ?? ''}`;
}

// Parse a string like "platinum" or ">= 1000" or "BTW 100 AND 500" into {operator, args}.
export function parseCellExpression(raw: any): { operator: string; args: any[] } {
  if (raw === null || raw === undefined) return { operator: 'ANY', args: [] };
  if (typeof raw !== 'string') return { operator: '=', args: [raw] };
  const s = raw.trim();
  if (s === '-' || s === '' || s === 'ANY') return { operator: 'ANY', args: [] };
  if (s === 'ELSE' || s === '_else_') return { operator: 'ELSE', args: [] };
  if (s === 'NULL' || s === 'null') return { operator: 'NULL', args: [] };
  if (s === '!NULL' || s === 'not null') return { operator: '!NULL', args: [] };

  const btw = s.match(/^(\!?BTW(?:\s+LO|\s+RO)?)\s+(.+?)\s+AND\s+(.+)$/i);
  if (btw) return { operator: btw[1].toUpperCase(), args: [btw[2].trim(), btw[3].trim()] };

  const cmp = s.match(/^(>=|<=|>|<|!=|=|!IN|IN|C TXT|C IN|!C IN|EQ ARR)\s+(.+)$/);
  if (cmp) return { operator: cmp[1].toUpperCase(), args: [cmp[2].trim()] };

  // Bare value — treat as equality
  return { operator: '=', args: [s] };
}
