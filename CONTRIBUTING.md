# Contributing to XRules

Thanks for your interest in contributing! XRules is a young open-source project, and good contributions move it forward fast.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you agree to abide by it.

## Ways to contribute

- **Bug reports** — file an issue with reproduction steps
- **Feature requests** — open a discussion *before* writing code, especially for non-trivial changes
- **Pull requests** — fix bugs, add small features, improve docs
- **Triage** — reproduce issues, label, link related problems
- **Documentation** — README, doc site, code comments
- **Translations** — currently English only; future i18n welcome

## Development setup

```bash
# Prerequisites: Node 20+, Rust 1.75+, Docker, Postgres
git clone https://github.com/hacka/xrules.git
cd xrules

docker compose up -d postgres
cd apps/xrules-backend
npm install
cp .env.example .env       # edit if needed
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev                # http://localhost:4000

# in another shell
cd apps/xrules-engine
cargo run                  # http://localhost:50051

# in another shell
cd apps/xrules-studio
npm install
cp .env.example .env.local
npm run dev                # http://localhost:3000
```

Login at `admin@example.com / admin123`.

## Project layout

```
apps/
├── xrules-backend     Express + Prisma. CRUD / Auth / Solver API
├── xrules-engine      Rust (Axum + Tonic). Pure rule execution
└── xrules-studio      Next.js 14. RunLoop-themed UI
deploy/
├── docker             Production Dockerfiles + compose
└── helm               Kubernetes Helm chart
docs/                  Docusaurus source for docs site
sdk/
├── typescript         npm @xrules/sdk
└── python             pip xrules-sdk
```

## Coding standards

### TypeScript / Node
- Strict mode on. No `any` unless commented why.
- Prisma models = source of truth for the schema.
- Studio never imports `@prisma/client` directly — only API.
- Use the existing utility helpers in `src/lib` / `src/utils`.

### Rust
- `cargo fmt` + `cargo clippy --all-targets -- -D warnings` clean.
- Errors: `thiserror` for typed, `anyhow` for context.
- Async: `tokio` only.

### React / Next.js
- App Router only.
- Server components by default, client components when state/effects are required.
- TanStack Query for server state.
- Zustand (with `persist`) for global client state.
- Tailwind class strings; no CSS-in-JS.

### Naming
- DB tables: snake_case, plural.
- API paths: kebab-case, plural (`/api-keys`, `/test-suites`).
- TypeScript identifiers: camelCase.
- React components: PascalCase.

## Pull-request checklist

Before opening a PR:

- [ ] Run `npm run build` in every affected package — must pass.
- [ ] Run `cargo test` if touching the engine.
- [ ] Run `npx tsc --noEmit` in `xrules-backend` and `xrules-studio`.
- [ ] Update `CHANGELOG.md` under `## [Unreleased]`.
- [ ] If you add/change an API: update OpenAPI spec generation in tests.
- [ ] If you add a Prisma field: update `seed.ts` so demo data still loads.
- [ ] One logical change per PR. Squash before merge.

## Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(studio): add Scorecard rule designer
fix(backend): wrap DECISION_TABLE in solver envelope
docs(api): document X-Strategy header
chore(ci): bump Node to 20.18
```

## Licensing

By submitting a contribution, you confirm that:

1. You have the right to submit it.
2. You agree it can be released under [AGPL-3.0](LICENSE).
3. You retain copyright but grant the project a perpetual, irrevocable license to use it under AGPL terms.

We do **not** require a separate CLA for individual contributions to the OSS core.

## Releasing

Releases are cut from `main`. Semantic versioning:

- Patch — bug fixes only.
- Minor — backward-compatible features.
- Major — breaking schema or API changes.

See [RELEASING.md](RELEASING.md).
