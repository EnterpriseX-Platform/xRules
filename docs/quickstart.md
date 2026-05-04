# Quickstart

Get a self-hosted XRules instance running locally in under 5 minutes.

## Prerequisites

- Docker + Docker Compose (recommended), OR
- Node.js 20+, Rust 1.75+, PostgreSQL 15+ for source install

## Option A — Docker Compose (recommended)

```bash
git clone https://github.com/your-org/xrules.git
cd xrules
cp .env.example .env
# (edit .env — set JWT_SECRET, CONNECTION_ENC_KEY)
docker compose -f docker-compose.production.yml up -d
```

Open Studio at http://localhost:3000. First-run will prompt you to create the admin account.

## Option B — From source

```bash
git clone https://github.com/your-org/xrules.git
cd xrules
./scripts/setup.sh   # installs deps, starts postgres, db push, seeds demo
./scripts/dev.sh     # starts studio (3000) + backend (4000) + engine (50051/50060)
```

## First rule

1. **Studio → Projects → New Project** — name it "demo".
2. **Build → Rules → New Rule** — pick **Decision Table**.
3. Add 2 input columns (`amount`, `country`), 1 output column (`decision`), and a row:
   `amount > 1000 ∧ country = "US"` → `"approve"`.
4. **Publish** — version 1 is now executable.
5. **Integrate → API Keys → New** — create a key.
6. **Test it:**

```bash
curl -X POST http://localhost:4000/api/v1/rules/<rule-slug>/execute \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: <your-api-key>' \
  -d '{"amount": 1500, "country": "US"}'
# → { "success": true, "data": { "output": { "decision": "approve" }, ... } }
```

## SDKs

- [TypeScript / JavaScript](../sdks/typescript/README.md) — `npm install @xrules/sdk`
- [Python](../sdks/python/README.md) — `pip install xrules`

## Next steps

- [Concepts](concepts.md) — projects, rules, flows, releases, environments
- [Architecture](architecture/overview.md) — service boundaries
- [Deployment](deployment/docker.md) — production deployment guide

## Configuration

Required environment variables:

| Var | Service | Notes |
|---|---|---|
| `DATABASE_URL` | backend | Postgres URL |
| `JWT_SECRET` | backend | min 32 chars |
| `CONNECTION_ENC_KEY` | backend | 32 chars, encrypts connection secrets |
| `ENGINE_HUB_URL` | backend | default `http://localhost:50051` |
| `ANTHROPIC_API_KEY` | backend | optional — enables AI Agent + AI Assistant |
| `OPENAI_API_KEY` | backend | optional — alt to Anthropic |
| `NEXT_PUBLIC_BACKEND_URL` | studio | default `http://localhost:4000` |

Full reference in `.env.example`.
