export const builtInFunctions: Record<string, Function> = {
  // Math functions
  abs: (x: number) => Math.abs(x),
  ceil: (x: number) => Math.ceil(x),
  floor: (x: number) => Math.floor(x),
  round: (x: number, precision = 0) => {
    const factor = Math.pow(10, precision);
    return Math.round(x * factor) / factor;
  },
  sqrt: (x: number) => Math.sqrt(x),
  pow: (base: number, exp: number) => Math.pow(base, exp),
  max: (...args: number[]) => Math.max(...args),
  min: (...args: number[]) => Math.min(...args),
  sum: (list: number[]) => list.reduce((a, b) => a + b, 0),
  mean: (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length,
  count: (list: unknown[]) => list.length,
  
  // String functions
  substring: (str: string, start: number, end?: number) =>
    str.substring(start, end),
  length: (str: string) => str.length,
  upper: (str: string) => str.toUpperCase(),
  lower: (str: string) => str.toLowerCase(),
  contains: (str: string, search: string) => str.includes(search),
  startsWith: (str: string, search: string) => str.startsWith(search),
  endsWith: (str: string, search: string) => str.endsWith(search),
  replace: (str: string, search: string, replace: string) =>
    str.replace(new RegExp(search, 'g'), replace),
  trim: (str: string) => str.trim(),
  
  // List functions
  get: (list: unknown[], index: number) => list[index - 1], // FEEL is 1-indexed
  append: (list: unknown[], ...items: unknown[]) => [...list, ...items],
  concatenate: (...lists: unknown[][]) => lists.flat(),
  insertBefore: (list: unknown[], index: number, item: unknown) => [
    ...list.slice(0, index - 1),
    item,
    ...list.slice(index - 1),
  ],
  remove: (list: unknown[], index: number) =>
    list.filter((_, i) => i !== index - 1),
  reverse: (list: unknown[]) => [...list].reverse(),
  indexOf: (list: unknown[], item: unknown) => list.indexOf(item) + 1,
  distinct: (list: unknown[]) => [...new Set(list)],
  flatten: (list: unknown[][]) => list.flat(),
  sort: (list: unknown[], order: 'asc' | 'desc' = 'asc') => {
    const sorted = [...list].sort();
    return order === 'desc' ? sorted.reverse() : sorted;
  },
  
  // Boolean functions
  not: (x: boolean) => !x,
  
  // Context functions
  getValue: (context: Record<string, unknown>, key: string) => context[key],
  
  // Date/Time functions
  today: () => new Date().toISOString().split('T')[0],
  now: () => new Date().toISOString(),
  year: (date: string) => new Date(date).getFullYear(),
  month: (date: string) => new Date(date).getMonth() + 1,
  day: (date: string) => new Date(date).getDate(),
  weekday: (date: string) => new Date(date).getDay(),
  
  // Null handling
  isNull: (value: unknown) => value === null || value === undefined,
  default: (value: unknown, defaultValue: unknown) =>
    value !== null && value !== undefined ? value : defaultValue,
};

// Type checking functions
export const typeFunctions: Record<string, Function> = {
  isNumber: (x: unknown) => typeof x === 'number',
  isString: (x: unknown) => typeof x === 'string',
  isBoolean: (x: unknown) => typeof x === 'boolean',
  isList: (x: unknown) => Array.isArray(x),
  isContext: (x: unknown) =>
    typeof x === 'object' && x !== null && !Array.isArray(x),
};

Object.assign(builtInFunctions, typeFunctions);
