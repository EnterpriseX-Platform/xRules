# Concepts

XRules is built around five primary entities. Understand these and the rest of the platform falls into place.

## Workspace
The top-level tenant boundary. Everything else is scoped to a workspace. Members have roles: `OWNER > ADMIN > MEMBER > VIEWER`.

## Project
A domain-scoped grouping inside a workspace. Each project has its own rules, flows, models, datasets, test suites, releases, and environments.

## Rule
An atomic decision unit. Eight types:

| Type | What it is | When to use |
|---|---|---|
| `DECISION_TABLE` | Tabular if-then matrix | Structured business rules with many branches |
| `DECISION_TREE`  | Branching IF/THEN/ELSE | Step-by-step decisions |
| `SCORECARD`      | Weighted point scoring → threshold decision | Credit, fraud, propensity |
| `FORMULA`        | Single expression | Lightweight calculations |
| `SCRIPT`         | Sandboxed JavaScript | Edge cases, custom logic |
| `LOOKUP`         | Key→value reference data | Currency rates, country mappings |
| `AI_AGENT`       | LLM-backed with structured output | Fuzzy decisions on unstructured input |
| `MODEL_CALL`     | Call uploaded ML/PMML artifact | Use trained predictors |

Every rule has `inputSchema` + `outputSchema` (JSON Schema 2020-12) which generate the per-rule OpenAPI 3.1 spec.

### Rule lifecycle
`DRAFT → READY → PUBLISHED → ARCHIVED`. Publishing creates an immutable `RuleVersion` snapshot that's pinnable in releases.

## Flow
Orchestrates rules. Two kinds:
- `DECISION` — synchronous, hard timeout, no jobs.
- `INTEGRATION` — asynchronous, Job-backed, can be long-running.

Flows are graphs of nodes (input, transform, rule call, HTTP, condition, switch, loop, llm prompt, ml model, …).

## Test Suite + Dataset + Test Case
- A **Test Case** is a single input/expected pair attached to a rule.
- A **Dataset** is a CSV/JSONL file of input rows.
- A **Test Suite** binds {rules} × {dataset} → runs them all and aggregates pass/fail/error.

## Release + Environment
A **Release** is a manifest of `{ruleId, version}[]` (plus flows + models). Releases are immutable.

An **Environment** (e.g. `dev`, `staging`, `production`) pins exactly one Release. The Solver API resolves `X-Environment: production` → that release's pinned versions.

## Connection
External system credential (HTTP, Postgres, Redis, Kafka, S3). Encrypted at rest with `CONNECTION_ENC_KEY`. Used by Flow nodes and AI Agents as model connectors.

## Webhook
Outbound event subscriptions. Events: `execute.success`, `execute.error`, more. HMAC-SHA256 signed. Per-rule filtering supported.

## API Key
Authenticates the public Solver API (`/api/v1/...`). Created in Studio → Integrations. Sent as `X-API-Key`.

## Solver headers
Per-call hints sent as `X-Context-<Key>: <Value>` headers. Available to rules via `context` parameter.

## DRD
Decision Requirements Diagram (DMN 1.4). Shows graph of rule→rule and flow→rule dependencies. Rendered at `Monitor → DRD`.

## Audit Log
Every state-changing operation gets an `AuditLog` row with actor, action, target, before/after diff. Browseable at `Monitor → Audit Log`.
