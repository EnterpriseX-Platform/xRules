// Sandboxed JS execution for Scripting Rules + Custom Code flow nodes.
// Uses Node's built-in `vm` module — sufficient for AGPL self-host without native deps.
// Runs in a fresh context with a timeout. NOT a true security boundary against
// determined attackers; for hostile multi-tenant SaaS, swap to isolated-vm.
import { Script, createContext } from 'node:vm';

const DEFAULT_TIMEOUT_MS = 5000;

interface ScriptingDefinition {
  source: string;
  language?: 'javascript';
  timeoutMs?: number;
}

// Optional `solve` callback so SCRIPT rules can invoke other rules
// asynchronously via `await DR.solve(slugOrId, input)`. The runner wires
// this via setSolveResolver to avoid a circular import on execute.service.
type SolveFn = (slugOrId: string, input: any) => Promise<any>;
let solveResolver: SolveFn | null = null;
export function setSolveResolver(fn: SolveFn) {
  solveResolver = fn;
}

// Returns a Promise — the inner script is wrapped in an `async function`
// so callers can `await DR.solve(...)` etc.
export function runScripting(def: ScriptingDefinition, input: any, ruleVariables?: any): Promise<any> {
  if (!def?.source) throw new Error('Scripting rule has no source');
  const wrapped = `
    (async function() {
      ${def.source}
    })()
  `;
  const sandbox: Record<string, any> = {
    input,
    ruleVariables: ruleVariables || {},
    DR: {
      solve: async (slugOrId: string, payload: any) => {
        if (!solveResolver) throw new Error('DR.solve() not available — solve resolver not registered');
        return solveResolver(slugOrId, payload);
      },
    },
    Math, Date, JSON, Number, String, Array, Object, Boolean, Promise,
    parseInt, parseFloat, isNaN, isFinite,
    console: { log: (..._a: any[]) => {} }, // muted
  };
  const ctx = createContext(sandbox, { name: 'xrules-sandbox' });
  const script = new Script(wrapped, { filename: 'rule.js' });
  return script.runInContext(ctx, { timeout: def.timeoutMs ?? DEFAULT_TIMEOUT_MS, displayErrors: true });
}

// Evaluate a single expression that returns a value. Used by Transform nodes
// in flows and Formula rules. Same sandbox; expression auto-wrapped.
export function evalExpression(expr: string, scope: Record<string, any>, timeoutMs = 1000): any {
  const wrapped = `(function() { return (${expr}); })()`;
  const ctx = createContext(scope, { name: 'xrules-expr' });
  const script = new Script(wrapped, { filename: 'expr.js' });
  return script.runInContext(ctx, { timeout: timeoutMs, displayErrors: true });
}
