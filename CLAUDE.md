# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**XRules v2** — multi-tenant decision management platform with visual rule designer, modeled after `decisionrules.io`. Monorepo using npm workspaces + Turbo.

The system supports:
- **Projects** as domain workspaces, with multiple **Rules** (decision tables/trees/formulas/scripts/lookups/model-calls)
- **Flows** to orchestrate data fetch → transform → call rules → output
- **Input/Output JSON Schemas** validated on every execution
- **Per-rule auto-generated OpenAPI 3.1 specs** (one URL per rule)
- **Versioning + Releases + Environments** (pin a release to dev/staging/prod)
- **Simulation**: version-diff, production-replay, sweep
- **Test Suites + Datasets + Test Cases** (batch + assertion testing)

## Architecture (3 services)

```
xrules-studio (Next.js 14)  →  xrules-backend (Express + Prisma)  →  xrules-engine (Rust)
   thin client                     CRUD + Auth + OpenAPI gen           pure execution
   port 3000                       port 4000                            port 50051 HTTP / 50060 gRPC
```

- **xrules-studio** (`apps/xrules-studio/`): App Router thin client. RunLoop-inspired theme (light default, indigo accent, monospace labels, dot-pattern bg). Multi-tenant routing under `[tenant]/projects/[projectId]/...`. Zustand for auth/project/theme state. TanStack Query for server state. Monaco for schema/JSON editing. ReactFlow for flow designer.
- **xrules-backend** (`apps/xrules-backend/`): Express + TypeScript + Prisma. Single source of truth for the schema. JWT auth (UI), API-Key auth (public Execute API). RBAC via `WorkspaceMember.role`. AES-256-GCM for connection secrets. Routes under `/projects, /rules, /flows, /test-suites, /datasets, /scenarios, /simulations, /releases, /environments, /connections, /api/v1/...`.
- **xrules-engine** (`apps/xrules-engine/`): Rust pure executor (Axum + Tonic). Stateless — receives inline rule/flow definition via gRPC/HTTP and returns output. No DB.

**Removed from v1**: separate `ml-engine`, `llm-engine`, `ai-engine`, `pmml-engine` services. Models are now first-class artifacts in `xrules-engine` adapters (Rust → optional Python/R sidecars). Studio's separate `prisma/` is gone — backend owns the schema.

## Build & Dev Commands

```bash
./scripts/setup.sh          # First-time setup (dev DB + deps)
./scripts/dev.sh            # Start all services concurrently
./scripts/stop.sh           # Stop all services
```

### Root (Turbo)
```bash
npm run dev | build | lint       # All apps
npm run db:setup                  # cd backend && prisma generate && db push
npm run db:migrate                # cd backend && prisma migrate dev
npm run db:studio                 # Prisma Studio
```

### Studio (`apps/xrules-studio`)
```bash
npm run dev      # Next dev (port 3000) — Studio is at /
npm run build    # Production build
npm run lint     # ESLint
npm test         # Jest
```

### Backend (`apps/xrules-backend`)
```bash
npm run dev          # tsx watch (port 4000)
npm run build        # tsc
npx prisma generate  # After schema.prisma changes
npx prisma db push   # Sync schema to DB (dev)
npm run db:seed      # Seed demo data
```

### Engine (`apps/xrules-engine`)
```bash
cargo run                       # Dev (50051 HTTP, 50060 gRPC)
cargo test [unit|integration|e2e]
cargo run --bin export_openapi  # Engine's OWN OpenAPI (not per-rule)
```

### Database
```bash
docker-compose up -d postgres   # PostgreSQL on port 5433
# user: xrules / pass: xrules_secret / db: xrulesdb
```

## v2 Entity Hierarchy

```
Workspace (tenant)
└── Project
    ├── Rule              + RuleVersion (immutable snapshots) + RuleDependency (DRD edges)
    ├── Flow              + FlowVersion
    ├── Model             (PMML / ML / LLM artifacts)
    ├── Connection        (HTTP/Postgres/MySQL/Redis/Kafka/S3 — encrypted at rest)
    ├── Dataset           (CSV/JSONL for batch testing)
    ├── TestCase          (per-rule assertion)
    ├── TestSuite + TestSuiteRule + TestRun + TestRunResult
    ├── Scenario          (named what-if input for simulation)
    ├── Simulation        (DIFF | REPLAY | CHAMPION_CHALLENGER | SWEEP)
    ├── Release           (manifest of {ruleId, version}[] + flows + models)
    └── Environment       (dev/staging/prod — pins one Release)
```

Workspace-scoped: `ApiKey`, `Webhook`, `WorkspaceMember`, `AuditLog`, `Execution`.

## Key Conventions

- **Schema source of truth**: `apps/xrules-backend/prisma/schema.prisma`. Studio consumes types via API; never imports `@prisma/client`.
- **TypeScript imports**: `@/*` → `src/*` in studio.
- **Frontend routing**: `/[tenant]/projects/[projectId]/...` — every project nested route lives here. Auth pages at root (`/login`, `/signup`).
- **Rule type values**: `DECISION_TABLE | DECISION_TREE | FORMULA | SCRIPT | LOOKUP | MODEL_CALL`. (`WORKFLOW` is gone — flows are first-class.)
- **Rule status**: `DRAFT → READY → PUBLISHED → ARCHIVED`. Publish creates a `RuleVersion` snapshot.
- **Execution endpoint**: `POST /api/v1/rules/:id/execute` (current version) or `POST /api/v1/rules/:id/v/:n/execute` (pinned). Auth via `X-API-Key` header.
- **Per-rule OpenAPI**: `GET /api/v1/rules/:id/openapi.json` — generated from `inputSchema` + `outputSchema`.
- **JSON Schema enforcement**: backend validates input via `middleware/schemaValidate.ts` before forwarding to engine. (Subset of JSON Schema 2020-12 — no Ajv dep.)
- **RBAC roles**: `OWNER > ADMIN > MEMBER > VIEWER`. Helper at `services/_access.ts` (`assertWorkspaceAccess`, `assertProjectAccess`).
- **Connection secrets**: AES-256-GCM via `CONNECTION_ENC_KEY` env. Never returned in list/get unless `?reveal=true` and caller is admin.

## Frontend Theme

Tokens in `src/app/globals.css` — `--c-bg`, `--c-surface`, `--c-sidebar`, `--c-accent`, etc. Stored as `r g b` triplets so Tailwind alpha modifier (`bg-accent/10`) works. `data-theme="dark|light"` on `<html>` switches tokens. Toggle in topbar; persists via `useTheme` zustand+persist store.

Layout: `AppShell` wraps everything inside `[tenant]/layout.tsx`. Sidebar (240px) has live status footer (engine/clock). Topbar has shell-style breadcrumb + live UTC clock + tick counter + ⌘K search + theme toggle.

Reusable: `<EntityTable>` (numbered rows, status pills, hover→hrefFor), `<StatusPill>`, `<Pill>`, `<PageHeader>` (title + description + monospace stat counters). Class helpers in `globals.css`: `.label-section`, `.nav-row`, `.live-pill`, `.tabs-row`, `.tab`, `.btn-primary`, `.btn-ghost`, `.input`, `.card`, `.pill-{ok,warn,danger,info,mint,subtle}`.

## Standards Compliance

- **DMN 1.4** (OMG): Decision Tables, FEEL — partial (in Rust engine).
- **PMML 4.4**: Model upload (R sidecar later).
- **JSON Schema 2020-12**: Input/Output schemas — subset validator in backend.
- **OpenAPI 3.1**: Auto-gen per rule.
- **JSONata / FEEL**: Formula language (planned).

## Environment

`apps/xrules-studio/.env.local`:
```
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

`apps/xrules-backend/.env`:
```
DATABASE_URL=postgresql://xrules:xrules_secret@localhost:5433/xrulesdb
JWT_SECRET=<min-32-chars>
ENGINE_HUB_URL=http://localhost:50051
CONNECTION_ENC_KEY=<random-32-chars>
PORT=4000
```

## Test Users (seeded)

| Username | Password | Roles |
|---|---|---|
| admin | admin123 | Admin |
| editor | editor123 | Editor |
| viewer | viewer123 | Viewer |

## v2 Status & Known Gaps

- ✅ Schema, backend routes, frontend layout & pages compile clean.
- ⚠ Test suite runner currently produces PENDING results — engine integration for batch execution is stubbed in `services/testsuites.service.ts::runSuite`.
- ⚠ DRD page is placeholder — needs ReactFlow render of `RuleDependency` edges.
- ⚠ Webhooks are schema-only — no dispatcher yet.
- ⚠ Simulation `CHAMPION_CHALLENGER` mode (live A/B) not yet implemented; `DIFF`, `REPLAY`, `SWEEP` are.
- ⚠ Connections UI list-only; no create/edit dialog yet.
- ⚠ Flow detail page (designer) not migrated to v2 — list page exists.

When extending, prefer adding to `services/_access.ts` over duplicating membership checks.
