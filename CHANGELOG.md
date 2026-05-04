# Changelog

All notable changes to XRules will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- AGPL-3.0 license
- README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY documents
- GitHub Actions CI for backend (TypeScript) + studio (Next.js) + engine (Rust)
- Production-ready `Dockerfile` per service and `docker-compose.production.yml`
- Helm chart skeleton under `deploy/helm/xrules`
- One-line install script `install.sh`

- **Sidebar restructure** following user journey: Build / Test / Deploy / Integrate / Monitor
- **Rules unified page** — single `/rules` URL with type filter chips and folder tree drag-drop
- **New Rule modal** — card-style picker over 8 rule types
- **Integrations section** — `/integrations/endpoints` per-rule OpenAPI viewer with curl + TS + Python snippets; API Keys + Webhooks moved here
- **DRD viewer** as the 8th tab on Rule Detail (ReactFlow auto-layout from RuleDependency)
- **Scorecard rule type** + designer (weighted attribute scoring)

- **AI Agent real LLM adapter** — OpenAI and Anthropic providers wired through Connection
- **JS sandbox** for Scripting Rule + Custom Code + Transform via `isolated-vm`
- **Backend Flow runner** evaluating all 22 node types (HTTP, DB, Branch, Switch, Foreach, Try/Catch, Sub-flow, AI Agent, Append, Join, Collect, …)
- **Webhook dispatcher** with HMAC-SHA256 signing and exponential retry
- **Test Suite real runner** — populates pass/fail/coverage per case
- **Tools UI panels** — Duplicates and Dependencies viewers
- **Visual debug overlay** on Decision Tables — green/red row tints from execution trace
- **Mapping UI panel** for Rule Call / HTTP / Transform nodes — visual data-dictionary picker
- **Rule comparison visual diff** per type (Table cell highlight, Tree node highlight)
- **Simple Bench** form mode + ignored-outputs UI in the Test tab
- **AI Assistant** chat panel + 3 sub-agents (Decision Table Architect, Test Data Generator, Rule Summarizer)
- **Templates library** — 10 starter rules importable from the New-Rule dialog

- **TypeScript SDK** at `sdk/typescript` (publishable as `@xrules/sdk`)
- **Python SDK** at `sdk/python` (publishable as `xrules-sdk`)
- **Docusaurus docs site** at `docs/`
- **Marketing landing page** at `apps/xrules-www`

### Changed

- **Connections** moved into the unified Integrations section (Outbound subtree)
- "Engine" terminology replaced by "Solver" everywhere (DR convention)
- Rule list now folder-aware with breadcrumb

### Notes

This `Unreleased` block aggregates the v2 build-out from the initial v1.x scaffolding. The first tagged release of XRules will be `v0.1.0`.

## [0.0.1] — pre-release scaffolding (historical)

- Initial monorepo with Next.js studio, Express backend, Rust engine
- Postgres-backed multi-tenant data model
- Basic CRUD for projects, rules, flows, executions
