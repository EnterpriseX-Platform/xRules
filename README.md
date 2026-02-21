# XRULES Platform v2

A modern SaaS Decision Management Platform with visual flow designer, multi-tenant architecture, and high-performance execution engine.

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  xrules-studio  │────▶│   xrules-api    │────▶│ xrules-engine   │
│   (Next.js)     │◄────│      (Go)       │◄────│    (Rust)       │
│   Port: 3000    │     │   Port: 8080    │gRPC  │   Port: 50051   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │                         │
                               ▼                         ▼
                        ┌─────────────┐           ┌─────────────┐
                        │  PostgreSQL │           │    Redis    │
                        │   Port: 5432│           │   Port: 6379│
                        └─────────────┘           └─────────────┘
```

### Services

| Service | Technology | Port | Description |
|---------|-----------|------|-------------|
| xrules-studio | Next.js 14 | 3000 | React frontend with visual flow designer |
| xrules-api | Go + Fiber | 8080 | REST API with multi-tenant support |
| xrules-engine | Rust + Tokio | 50051 | High-performance gRPC execution engine |
| PostgreSQL | PostgreSQL 16 | 5432 | Primary database |
| Redis | Redis 7 | 6379 | Caching & session store |

## SaaS Hierarchy

```
Workspace (Tenant)
├── Members (Owner, Admin, Member)
├── Projects
│   ├── Connections (DB, HTTP, SFTP)
│   ├── Rules/Flows
│   │   ├── Nodes (API Input, DB, HTTP, Condition, etc.)
│   │   ├── Edges
│   │   └── Executions
│   ├── Schedules
│   └── Baskets
└── Settings
```

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development)
- Go 1.21+ (for local development)
- Rust 1.75+ (for local development)

### 1. Clone and Setup

```bash
git clone <repository>
cd XRULES

# Copy environment file
cp .env.example .env
# Edit .env with your configurations
```

### 2. Run with Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

### 3. Access the Application

- **Studio (UI)**: http://localhost:3000
- **API Documentation**: http://localhost:8080/swagger
- **Engine Metrics**: http://localhost:9090/metrics
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

## Development

### Frontend (xrules-studio)

```bash
cd xrules-studio
npm install
npm run dev
```

### Backend API (xrules-api)

```bash
cd xrules-api
go mod download
go run cmd/server/main.go
```

### Execution Engine (xrules-engine)

```bash
cd xrules-engine
cargo build --release
./target/release/xrules-engine
```

## Features

### Visual Flow Designer
- Drag-and-drop node editor (React Flow)
- Node types: API Input/Output, Database, HTTP, Condition, Transform, SFTP, Delay
- Real-time validation and testing
- Execution tracing with logs

### Multi-Tenant SaaS
- Workspace-based organization
- Role-based access control (RBAC)
- Project isolation
- Resource quotas

### Connections
- PostgreSQL, MySQL, SQLite, Oracle, MSSQL
- HTTP/REST APIs with auth
- SFTP file operations
- Connection pooling and health checks

### Execution Engine
- Async DAG execution with Tokio
- Fan-out/Fan-in parallel processing
- Retry logic and circuit breaker
- Real-time log streaming via gRPC
- Cron-based scheduling

### API & Integration
- RESTful API with Swagger docs
- gRPC for engine communication
- JWT authentication
- Webhook support

## Project Structure

```
xrules-v2/
├── docker-compose.yml          # Full stack orchestration
├── .env.example                # Environment template
├── README.md
│
├── xrules-studio/              # Next.js Frontend
│   ├── app/                    # App Router
│   ├── components/             # React components
│   │   ├── flow-designer/      # React Flow nodes
│   │   ├── layout/             # Sidebar, Header
│   │   └── ui/                 # shadcn/ui components
│   ├── stores/                 # Zustand state
│   ├── lib/                    # API client
│   └── types/                  # TypeScript types
│
├── xrules-api/                 # Go Backend
│   ├── cmd/server/             # Entry point
│   ├── internal/
│   │   ├── api/handlers/       # HTTP handlers
│   │   ├── service/            # Business logic
│   │   ├── repository/         # Data access
│   │   ├── domain/             # Domain models
│   │   └── infra/              # Database, Cache
│   └── proto/                  # gRPC definitions
│
└── xrules-engine/              # Rust Execution Engine
    ├── src/
    │   ├── engine/             # Execution engine
    │   ├── nodes/              # Node executors
    │   ├── executors/          # Connection executors
    │   ├── server/             # gRPC server
    │   └── stores/             # Data persistence
    └── proto/                  # gRPC definitions
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `GET /api/v1/auth/me` - Current user

### Workspaces
- `GET /api/v1/workspaces` - List workspaces
- `POST /api/v1/workspaces` - Create workspace
- `GET /api/v1/workspaces/:id` - Get workspace

### Projects
- `GET /api/v1/workspaces/:id/projects` - List projects
- `POST /api/v1/workspaces/:id/projects` - Create project
- `GET /api/v1/projects/:id` - Get project

### Rules/Flows
- `GET /api/v1/projects/:id/rules` - List rules
- `POST /api/v1/projects/:id/rules` - Create rule
- `GET /api/v1/rules/:id` - Get rule
- `PUT /api/v1/rules/:id` - Update rule
- `POST /api/v1/rules/:id/execute` - Execute rule
- `GET /api/v1/rules/:id/executions` - Get executions

### Connections
- `GET /api/v1/projects/:id/connections` - List connections
- `POST /api/v1/projects/:id/connections` - Create connection
- `POST /api/v1/connections/:id/test` - Test connection

## Node Types

| Node | Description |
|------|-------------|
| `api_input` | API entry point with request validation |
| `api_output` | API response configuration |
| `database` | SQL query execution (PostgreSQL, MySQL, etc.) |
| `http_request` | HTTP/REST API calls |
| `condition` | Conditional branching |
| `transform` | Data transformation (JSON, Template) |
| `sftp` | File transfer operations |
| `delay` | Execution pause/delay |
| `aggregate_split` | Fan-out to parallel branches |
| `aggregate_join` | Fan-in from parallel branches |
| `schedule_trigger` | Cron-based trigger |
| `basket_trigger` | File basket trigger |

## Deployment

### Production

```bash
# Build and start in production mode
export ENV=production
docker-compose -f docker-compose.yml up -d

# With monitoring stack
docker-compose --profile monitoring up -d
```

### Kubernetes

```bash
# Apply manifests
kubectl apply -f k8s/
```

## Monitoring

- **Prometheus**: http://localhost:9091
- **Grafana**: http://localhost:3001 (admin/admin)
- **Engine Metrics**: http://localhost:9090/metrics

## License

MIT License - See LICENSE file

## Support

For issues and feature requests, please use GitHub Issues.
