# XRules

> Multi-tenant decision management platform with visual rule designer.
> Inspired by [decisionrules.io](https://www.decisionrules.io/) and the RunLoop UI.

## Features

- **Projects** — domain workspaces grouping rules, flows, models, integrations
- **Rules** — Decision Tables, Decision Trees, Formulas, Scripts, Lookups, Model-Calls
- **Flows** — orchestrate `fetch → transform → call rules → output` (ReactFlow designer)
- **Input/Output Schemas** — JSON Schema 2020-12, validated on every execution
- **Auto OpenAPI per rule** — `GET /api/v1/rules/:id/openapi.json`
- **Versioning + Releases + Environments** — pin a snapshot to dev/staging/prod
- **Simulation** — version diff, production replay, sensitivity sweep
- **Test Suites + Datasets** — batch testing with coverage reports
- **API Keys + Webhooks** (HMAC-signed) for outbound integrations

## Structure

```
XRULES/
├── apps/
│   ├── xrules-studio/     Next.js 14 thin client       (port 3000)
│   ├── xrules-backend/    Express + Prisma             (port 4000)
│   └── xrules-engine/     Rust executor (Axum + Tonic) (50051 / 50060)
├── docker-compose.yml     PostgreSQL 16
└── scripts/               dev/setup helpers
```

## Quick Start

```bash
# 1. PostgreSQL
docker-compose up -d postgres

# 2. Backend (port 4000)
cd apps/xrules-backend
npm install
npx prisma generate
npx prisma db push
npm run db:seed              # creates demo workspace + admin@xrules.local / admin123
npm run dev

# 3. Engine (port 50051)
cd apps/xrules-engine
cargo run

# 4. Studio (port 3000)
cd apps/xrules-studio
npm install
npm run dev

open http://localhost:3000
```

Or use the helper:

```bash
./scripts/setup.sh
./scripts/dev.sh
```

## URLs

| URL                                            | What                              |
|------------------------------------------------|-----------------------------------|
| `http://localhost:3000`                        | Studio (login / dashboard / etc.) |
| `http://localhost:4000/api/v1/rules/:id/execute` | Public Execute API (X-API-Key)  |
| `http://localhost:4000/api/v1/rules/:id/openapi.json` | Per-rule OpenAPI spec     |
| `http://localhost:50051/docs`                  | Rust engine Swagger               |

## Database

```
host:     localhost
port:     5433
user:     xrules
password: xrules_secret
database: xrulesdb
```

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — instructions for Claude Code (architecture, conventions, gaps)
- [`AGENTS.md`](AGENTS.md) — agent-facing notes (component breakdowns)
