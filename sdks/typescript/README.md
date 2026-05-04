# @xrules/sdk

Official TypeScript / JavaScript SDK for [XRules](https://github.com/your-org/xrules) — open-source decision management platform.

```bash
npm install @xrules/sdk
```

## Quick start

```typescript
import { XRulesClient } from '@xrules/sdk';

const client = new XRulesClient({
  baseUrl: 'https://api.xrules.example',
  apiKey:  process.env.XRULES_API_KEY!,
});

// Execute a rule (by slug, alias, or id)
const result = await client.execute('loan-approval', {
  income:     85_000,
  ficoScore:  720,
  loanAmount: 250_000,
});

console.log(result.output);   // { decision: 'APPROVE', tier: 'A' }
console.log(result.duration); // ms

// Pin to a specific version
await client.execute('loan-approval', input, { version: 7 });

// Pin to an environment (uses release pinned to that env)
await client.execute('loan-approval', input, { environment: 'production' });

// Solver headers
await client.execute('loan-approval', input, {
  context: { strategy: 'best-fit', tenant: 'acme-corp' },
});

// Batch execute one rule across many inputs (server-side fan-out)
const batch = await client.batchExecute('credit-score', [input1, input2, input3]);

// Inspect the auto-generated OpenAPI 3.1 spec
const spec = await client.getOpenApi('loan-approval');
```

## Error handling

```typescript
import { XRulesError } from '@xrules/sdk';

try {
  await client.execute('not-a-real-rule', {});
} catch (e) {
  if (e instanceof XRulesError) {
    console.error(e.status, e.code, e.message);
  }
}
```

## Authentication

API keys are created in **Studio → Integrations → API Keys**. Pass the key as `apiKey`; it's sent as `X-API-Key` on every request.

## License

AGPL-3.0 — see [LICENSE](https://github.com/your-org/xrules/blob/main/LICENSE).
