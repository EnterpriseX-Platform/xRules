# AGENTS.md - XRules Platform

> This file contains essential information for AI coding agents working on the XRules Platform.
> XRules is a Decision Management Platform with Visual Rule Designer.

## Project Overview

XRules is a multi-tenant decision management platform that allows organizations to create, manage, and execute business rules using various execution engines. It supports multiple rule formats including DMN tables, PMML models, ML models, and LLM integrations.

### Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (xrules-studio)      │  Next.js 14, TypeScript, Tailwind
│  Port: 3000                    │  Prisma ORM, React Query, Zustand
├─────────────────────────────────────────────────────────────────┤
│  Engine Hub (xrules-engine)    │  Rust, Axum, Tonic (gRPC)
│  Ports: 50051/50060            │  JWT Auth, Router, Protocol Bridge
├─────────────────────────────────────────────────────────────────┤
│  Engine Registry (5 engines)   │
│  ├── Rules Engine              │  Rust (embedded in Hub) - DMN 1.4
│  ├── PMML Engine               │  R + Plumber - PMML 4.4 - Port 50052
│  ├── ML Engine                 │  Python + FastAPI - scikit-learn - Port 50053
│  ├── LLM Engine                │  Python + FastAPI - OpenAI/Claude - Port 50054
│  └── AI Engine                 │  Python + FastAPI - TensorFlow/PyTorch - Port 50055
├─────────────────────────────────────────────────────────────────┤
│  Data Layer                    │
│  ├── PostgreSQL                │  Primary database - Port 5433
│  ├── TimescaleDB               │  Analytics (optional) - Port 5434
│  └── Kafka                     │  Event streaming (optional) - Port 9092
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Frontend** | Next.js, React, TypeScript | 14.x |
| **Styling** | TailwindCSS | 3.4.x |
| **State** | Zustand, React Query | 4.x, 5.x |
| **API Gateway** | Axum (Rust) | 0.7 |
| **gRPC** | Tonic, Prost | 0.11 |
| **Auth** | jsonwebtoken, bcrypt | 9.x |
| **Database** | PostgreSQL | 16 |
| **ORM** | Prisma | Latest |
| **Python** | FastAPI, Pydantic | 0.104+ |
| **R** | Plumber, pmml | Latest |

## Project Structure

```
XRULES/
├── apps/
│   ├── xrules-studio/          # Next.js frontend (main entry point)
│   │   ├── src/
│   │   │   ├── app/            # Next.js App Router
│   │   │   │   ├── [tenant]/   # Multi-tenant routes
│   │   │   │   ├── login/      # Auth pages
│   │   │   │   └── demo/       # Demo pages
│   │   │   ├── components/     # React components
│   │   │   │   ├── ui/         # Base UI (Radix + Tailwind)
│   │   │   │   ├── rules/      # Rule editor components
│   │   │   │   ├── flows/      # Flow designer (ReactFlow)
│   │   │   │   └── layout/     # Layout components
│   │   │   ├── api/            # API client
│   │   │   ├── hooks/          # React Query hooks
│   │   │   ├── stores/         # Zustand stores
│   │   │   └── types/          # TypeScript types
│   │   ├── prisma/
│   │   │   └── schema.prisma   # Database schema
│   │   └── tests/              # Jest tests
│   │
│   ├── xrules-engine/          # Rust Engine Hub
│   │   ├── src/
│   │   │   ├── api/            # HTTP API handlers
│   │   │   ├── auth/           # JWT authentication
│   │   │   ├── engines/        # Engine adapters (5 engines)
│   │   │   ├── hub/            # Engine Hub (router/registry)
│   │   │   ├── grpc/           # gRPC server/client
│   │   │   ├── protocol/       # Protocol translation
│   │   │   └── standards/      # DMN, JSON Schema, OpenAPI
│   │   ├── tests/              # 85+ tests (unit, integration, e2e)
│   │   └── proto/              # gRPC protobuf definitions
│   │
│   ├── ml-engine/              # Python ML Engine (scikit-learn, XGBoost)
│   ├── llm-engine/             # Python LLM Engine (OpenAI, Anthropic)
│   ├── ai-engine/              # Python AI Engine (TensorFlow, PyTorch)
│   └── pmml-engine/            # R PMML Engine (PMML 4.4)
│
├── k8s/                        # Kubernetes manifests (Kustomize)
│   ├── base/                   # Base deployments
│   └── overlays/               # Environment overlays (dev/staging/prod)
├── scripts/                    # Development scripts
│   ├── setup.sh                # First-time setup
│   ├── dev.sh                  # Start development
│   └── stop.sh                 # Stop services
├── docs/                       # Documentation
└── docker-compose.yml          # PostgreSQL for development
```

## Build and Development Commands

### Quick Start (Recommended)

```bash
# First-time setup
./scripts/setup.sh

# Start development
./scripts/dev.sh

# Stop all services
./scripts/stop.sh
```

### Manual Setup

```bash
# Start PostgreSQL
docker-compose up -d postgres

# Setup xrules-studio
cd apps/xrules-studio
npm install
npx prisma generate
npx prisma db push
npm run dev
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server (port 3000) |
| `npm run build` | Build production bundle |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Jest tests |
| `npm run storybook` | Start Storybook (port 6006) |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:studio` | Open Prisma Studio |

### Turbo Commands (Root)

```bash
# Run dev on all apps
npm run dev

# Build all apps
npm run build

# Lint all apps
npm run lint
```

### Rust Engine Commands

```bash
cd apps/xrules-engine

# Run dev
cargo run

# Run tests (85+ tests)
cargo test
cargo test unit
cargo test integration
cargo test e2e

# Build release
cargo build --release

# Generate OpenAPI
cargo run --bin export_openapi
```

### Python Engines

```bash
# ML Engine
cd apps/ml-engine
pip install -e "."
python -m uvicorn src.main:app --host 0.0.0.0 --port 50053 --reload

# LLM Engine
cd apps/llm-engine
pip install -e ".[anthropic]"
python -m uvicorn src.main:app --host 0.0.0.0 --port 50054 --reload

# AI Engine
cd apps/ai-engine
pip install -e ".[tensorflow,torch]"
python -m uvicorn src.main:app --host 0.0.0.0 --port 50055 --reload
```

### R PMML Engine

```bash
cd apps/pmml-engine
Rscript -e "install.packages(c('plumber', 'pmml', 'XML', 'jsonlite', 'logger'))"
Rscript plumber.R
```

## Development URLs

| URL | Description |
|-----|-------------|
| http://localhost:3000 | Studio Frontend (Next.js) |
| http://localhost:3000/xrules/studio | Studio Dashboard |
| http://localhost:50051/api/v1 | Engine Hub REST API |
| http://localhost:50051/docs | Swagger UI |
| http://localhost:50051/health | Health check |
| http://localhost:50052 | PMML Engine (R) |
| http://localhost:50053 | ML Engine (Python) |
| http://localhost:50054 | LLM Engine (Python) |
| http://localhost:50055 | AI Engine (Python) |

## Database Configuration

### PostgreSQL (Development)

```yaml
Host: localhost:5433
User: xrules
Password: xrules_secret
Database: xrulesdb
```

### Prisma Schema Overview

- **User**: Platform users
- **Workspace**: Multi-tenant workspaces with slug
- **WorkspaceMember**: User roles per workspace (Owner/Admin/Member/Viewer)
- **Project**: Projects within workspaces
- **Rule**: Rule definitions (types: DECISION_TABLE, DECISION_TREE, FORMULA, WORKFLOW)
- **Execution**: Rule execution history

### Database Commands

```bash
# Generate Prisma Client
npx prisma generate

# Push schema to database
npx prisma db push

# Run migrations
npx prisma migrate dev

# Open Prisma Studio
npx prisma studio
```

## Code Style Guidelines

### TypeScript / Next.js

- **Framework**: Next.js 14 with App Router
- **Styling**: TailwindCSS with custom design tokens
- **State**: Zustand for global state, React Query for server state
- **Components**: Functional components with hooks
- **Types**: Strict TypeScript enabled

### Key Conventions

```typescript
// Path aliases - use @/* for src imports
import { Button } from '@/components/ui/Button';
import { useRules } from '@/hooks/useRules';

// React Query hooks naming
const { data: rules, isLoading } = useRules({ projectId });
const createRule = useCreateRule();
const executeRule = useExecuteRule();

// Zustand store access
const { currentTenant, canEdit } = useTenantStore();
```

### ESLint Configuration

```json
{
  "extends": "next/core-web-vitals"
}
```

### Rust Code Style

- **Framework**: Axum for HTTP, Tonic for gRPC
- **Error Handling**: anyhow for errors, thiserror for custom errors
- **Async**: Tokio runtime
- **Database**: sqlx with compile-time checked queries

### Python Code Style

- **Formatter**: Black (line-length: 100)
- **Linter**: Ruff
- **Type Checker**: mypy (optional)
- **Framework**: FastAPI with Pydantic v2

## Testing Instructions

### Frontend (Jest)

```bash
cd apps/xrules-studio
npm test
npm run test:watch
```

### Rust Engine (85+ tests)

```bash
cd apps/xrules-engine

# All tests
cargo test

# Categories
cargo test unit         # 41 tests - core components
cargo test integration  # 33 tests - HTTP/gRPC endpoints
cargo test e2e          # 9 tests - complete workflows

# With output
cargo test -- --nocapture

# Coverage
cargo install cargo-tarpaulin
cargo tarpaulin --out Html
```

### Test Users (for integration tests)

| Username | Password | Roles |
|----------|----------|-------|
| admin | admin123 | Admin, Editor, Viewer |
| editor | editor123 | Editor, Viewer |
| viewer | viewer123 | Viewer |

### Python Engines

```bash
cd apps/ml-engine  # or llm-engine, ai-engine
pytest
pytest -v
```

## Security Considerations

### JWT Authentication

- Access tokens expire after 15 minutes
- Refresh tokens expire after 7 days
- Tokens include user roles for RBAC
- Auth middleware protects API routes

### RBAC Roles

| Role | Permissions |
|------|-------------|
| Viewer | Execute rules, view definitions |
| Editor | Create/edit rules, validate |
| Admin | Full access including delete |
| Owner | Workspace management |

### Environment Variables

Create `.env.local` in `apps/xrules-studio`:

```env
DATABASE_URL=postgresql://xrules:xrules_secret@localhost:5433/xrulesdb
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-min-32-chars
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:50051
```

## Deployment

### Docker Compose (Development)

```bash
# Start PostgreSQL only
docker-compose up -d

# Analytics stack (optional)
docker-compose -f docker-compose.analytics.yml up -d
```

### Kubernetes

```bash
# Development
kubectl apply -k k8s/overlays/development/

# Production
kubectl apply -k k8s/overlays/production/

# Port forward for local access
kubectl port-forward -n xrules svc/xrules-studio 3000:3000
kubectl port-forward -n xrules svc/xrules-engine 50051:50051
```

### Engine Ports

| Engine | Port | Protocol |
|--------|------|----------|
| Rules (Hub) | 50051 | HTTP + gRPC |
| Rules (Hub) | 50060 | gRPC only |
| PMML | 50052 | HTTP |
| ML | 50053 | HTTP |
| LLM | 50054 | HTTP |
| AI | 50055 | HTTP |

## Key Documentation

| Document | Location |
|----------|----------|
| Architecture Overview | `docs/architecture/overview.md` |
| Frontend Setup Guide | `docs/FRONTEND-SETUP.md` |
| Engine Test Suite | `docs/testing/engine-tests.md` |
| K8s Deployment | `k8s/README.md` |
| PMML Engine | `apps/pmml-engine/README.md` |
| ML Engine | `apps/ml-engine/README.md` |
| LLM Engine | `apps/llm-engine/README.md` |
| AI Engine | `apps/ai-engine/README.md` |

## Important Notes for AI Agents

1. **Multi-tenancy**: All routes are scoped by tenant slug (`/{tenant}/projects`)
2. **Engine Routing**: The Rust Hub routes rules to appropriate engines based on `rule.type`
3. **Type Safety**: Maintain strict TypeScript types; Prisma generates types from schema
4. **Testing**: Always run tests before committing; Rust has 85+ comprehensive tests
5. **Database**: Use Prisma migrations for schema changes; never modify SQL directly
6. **API Design**: Follow REST conventions; use OpenAPI/Swagger for documentation
7. **Error Handling**: Return structured errors with appropriate HTTP status codes
8. **Logging**: Use tracing in Rust, logger in Python/R for consistent logging
9. **Comments**: Project uses English and Thai (ภาษาไทย) in documentation
10. **Standards**: DMN 1.4, PMML 4.4, OpenAPI 3.1 are the key standards supported
