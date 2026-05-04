<div align="center">

# XRules

**The modern, AI-native, self-hostable decision platform.**

Open-source decision rules engine. Run on your VPS. AI-native. Faster than Drools, simpler than Camunda, more flexible than closed-cloud SaaS.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Status: Beta](https://img.shields.io/badge/Status-Beta-yellow.svg)]()
[![Made with: Rust + TypeScript](https://img.shields.io/badge/Made%20with-Rust%20%2B%20TypeScript-orange.svg)]()

[Quick Start](#quick-start) · [Documentation](#documentation) · [Why XRules](#why-xrules) · [Roadmap](#roadmap)

</div>

---

## What is XRules?

XRules is a **business rules and decision platform** that lets engineering and product teams design, test, deploy, and serve decision logic — without burying it in application code.

You author **rules** (Decision Tables, Trees, Scripting, Lookup, Scorecards, AI Agents, Model Calls), wire them together in **Flows**, attach **JSON Schemas** for typed I/O, **publish** versioned snapshots to environments, and expose them as **REST endpoints with auto-generated OpenAPI** for any client to call.

Every rule call is logged, every version is immutable, every execution is reproducible.

## Why XRules

| | XRules | Drools | Camunda DMN | DecisionRules.io |
|---|---|---|---|---|
| License | AGPL-3.0 | Apache 2.0 | Camunda License | Closed |
| Self-host | ✅ | ✅ | ✅ | ❌ |
| Stack | Rust + TypeScript | Java/JVM | Java/JVM | Closed |
| Modern UI | ✅ Tailwind / RunLoop-style | ❌ Workbench (2010) | ✅ | ✅ |
| AI-native (LLM rule type) | ✅ first-class | ⚠️ via custom | ❌ | ✅ |
| AI authoring assistant | ✅ | ❌ | ❌ | ✅ |
| Scorecard rule type | ✅ | ⚠️ via DRL | ❌ | ❌ |
| Decision Flow editor | ✅ ReactFlow + 22 node types | ⚠️ rule flow | ✅ BPMN | ✅ |
| Auto OpenAPI per rule | ✅ | ❌ | ❌ | ✅ |
| Per-rule versioning + comparison | ✅ | ⚠️ KIE versions | ✅ | ✅ |
| Async Jobs | ✅ | ⚠️ | ✅ | ✅ |
| Standards | DMN 1.4 / PMML 4.4 / JSON Schema 2020-12 / OpenAPI 3.1 | DMN 1.x / DRL | DMN 1.3 / BPMN 2.0 | DMN-aligned |

We are **not** trying to be every BRMS. We are trying to be the one a developer-led team picks because:

- It runs on a $10/month VPS with one Docker Compose command.
- Every rule is JSON-serializable and version-controllable in Git.
- LLM-backed AI Agents are a built-in rule kind, not an afterthought.
- The UI is dense and ergonomic for builders, not click-through wizards for analysts.

## Architecture

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  xrules-studio   │───▶│  xrules-backend  │───▶│  xrules-engine   │
│  Next.js 14      │    │  Express+Prisma  │    │  Rust (Axum+Tonic)│
│  (port 3000)     │    │  (port 4000)     │    │  (50051 / 50060) │
│  RunLoop theme   │    │  Auth · CRUD ·   │    │  Stateless rule  │
│  monaco · RF     │    │  OpenAPI gen ·   │    │  executor (DMN,  │
│                  │    │  Solver API ·    │    │  Lookup, Tree,   │
│                  │    │  Webhook · Jobs ·│    │  Script, AI)     │
│                  │    │  BI · Test runs  │    │                  │
└──────────────────┘    └────────┬─────────┘    └──────────────────┘
                                 │
                          ┌──────┴──────┐
                          │ PostgreSQL  │
                          └─────────────┘
```

Three services. One PostgreSQL. That's it.

## Quick Start

### Option 1 — Docker Compose (recommended)

```bash
git clone https://github.com/hacka/xrules.git
cd xrules

# Spin up everything (Postgres + backend + studio + engine)
docker compose -f docker-compose.production.yml up -d

# Open the studio
open http://localhost:3000
```

Demo credentials are seeded automatically:

| User | Password | Role |
|---|---|---|
| `admin@example.com` | `admin123` | Owner |
| `editor@example.com` | `editor123` | Editor |
| `viewer@example.com` | `viewer123` | Viewer |

### Option 2 — Local development

Requires: Node 20+, Rust 1.75+, Docker (for PostgreSQL only).

```bash
# 1. PostgreSQL
docker compose up -d postgres

# 2. Backend (terminal 1)
cd apps/xrules-backend
npm install
npx prisma db push
npm run db:seed
npm run dev          # :4000

# 3. Engine (terminal 2)
cd apps/xrules-engine
cargo run            # :50051 + :50060

# 4. Studio (terminal 3)
cd apps/xrules-studio
npm install
npm run dev          # :3000
```

### Option 3 — Helm (Kubernetes)

```bash
helm install xrules deploy/helm/xrules \
  --set postgres.password=$(openssl rand -hex 16) \
  --set encryption.connectionKey=$(openssl rand -hex 32) \
  --set jwt.secret=$(openssl rand -hex 32)
```

## Concepts

```
Workspace (tenant)
└── Project (domain grouping)
    ├── Folder (5 levels deep)
    │   ├── Rule    ← Decision Table | Tree | Scorecard | Formula
    │   │              | Script | Lookup | AI Agent | Model Call
    │   └── Flow    ← Decision Flow (sync) | Integration Flow (async, Job-backed)
    ├── Connection  (outbound creds: HTTP / DB / Kafka / S3)
    ├── Model       (uploaded ML/PMML/LLM artifacts)
    ├── Dataset     (sample data for batch testing)
    ├── Test Suite  (assertions across rules)
    ├── Scenario    (named what-if input)
    ├── Simulation  (DIFF / REPLAY / SWEEP)
    ├── Release     (immutable snapshot bundle)
    └── Environment (dev / staging / prod — pins one Release)

Workspace-scoped: API Keys, Webhooks, Audit Logs, Members.
```

### Rule Lifecycle

```
DRAFT  →  READY  →  PUBLISHED  →  ARCHIVED
                        │
                        ▼
                   pinned in Environment
                       │
                       ▼
              POST /api/v1/{env}/rules/{slug}/execute
```

Every Save creates a new immutable RuleVersion. Publishing pins it to an Environment.

## API

```bash
curl -X POST 'https://xrules.example.com/api/v1/rules/discount-tiers/v/3/execute' \
  -H 'X-API-Key: xr_live_…' \
  -H 'X-Strategy: FIRST_MATCH' \
  -H 'X-Correlation-Id: req-123' \
  -H 'X-Audit: true' \
  -H 'Content-Type: application/json' \
  -d '{
    "data": { "customerTier": "platinum", "orderAmount": 1500 }
  }'
```

Returns:

```json
{
  "output": { "discountPercent": 20, "freeShipping": true },
  "duration_ms": 4,
  "version": 3,
  "correlation_id": "req-123"
}
```

Every published rule auto-generates an OpenAPI 3.1 spec at `GET /api/v1/rules/{slug}/openapi.json`. Drop it into Swagger UI, Postman, or any code generator.

### SDKs

```ts
// TypeScript
import { XRulesClient } from '@xrules/sdk';

const client = new XRulesClient({ apiKey: process.env.XRULES_KEY });
const result = await client.rules.execute('discount-tiers', {
  customerTier: 'platinum',
  orderAmount: 1500,
});
```

```python
# Python
from xrules import XRulesClient

client = XRulesClient(api_key=os.environ['XRULES_KEY'])
result = client.rules.execute('discount-tiers', {
    'customerTier': 'platinum',
    'orderAmount': 1500,
})
```

## Documentation

- [Quick Start](docs/quick-start.md) — your first rule in 5 minutes
- [Self-hosting Guide](docs/self-hosting.md) — Docker Compose, Helm, environment vars
- [Rule Types](docs/rule-types.md) — when to use Table vs Tree vs Scorecard vs Script vs AI Agent
- [Flow Designer](docs/flows.md) — 22 node types and how to wire them
- [API Reference](docs/api.md) — Solver, Management, BI, Jobs APIs
- [Architecture](docs/architecture.md) — service topology, data model, scaling notes

## Roadmap

| Quarter | Theme | Highlights |
|---|---|---|
| Q1 ✅ | Foundation | DT/Tree/Scoring/Lookup/Script/AI/Model rule types · Flow Designer · Releases · Environments · Solver API |
| Q2 | Production | Multi-region · SSO/SAML (EE) · Connectors marketplace · Approval workflows |
| Q3 | Scale | Cluster mode · Read replicas · Cold storage tier · GDPR data residency |
| Q4 | Ecosystem | VS Code extension · Postman fork · Terraform provider · GitHub App |

## Commercial / Enterprise

XRules core is **AGPL-3.0**. Self-host any business use, modify the code, ship modifications under AGPL.

For commercial deployments that cannot accept AGPL terms (closed-source product embedding, cloud resale), **Enterprise licenses** are available with:

- SSO / SAML / SCIM
- Audit log retention beyond 90 days
- Multi-region high-availability
- Priority support SLA
- Advanced connectors (Snowflake, Oracle DB, SAP)

Contact: enterprise@xrules.dev (placeholder)

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
# Fork → branch → PR
git clone https://github.com/YOUR-USER/xrules.git
cd xrules
docker compose up -d postgres
cd apps/xrules-backend && npm install && npx prisma db push && npm run db:seed
cd ../xrules-studio && npm install
cd ../xrules-engine && cargo build
```

By contributing, you agree the work will be released under AGPL-3.0.

## Security

If you discover a vulnerability, please email security@xrules.dev rather than opening a public issue. See [SECURITY.md](SECURITY.md).

## License

[GNU Affero General Public License v3.0](LICENSE) — © 2026 XRules contributors.

> ⚖️ **Note on AGPL**: If you run a modified version of XRules **as a service** (i.e. users interact with it over the network), you must offer your users access to the corresponding source code. This is the AGPL "network use" clause. If you only use XRules internally, this does not apply.
