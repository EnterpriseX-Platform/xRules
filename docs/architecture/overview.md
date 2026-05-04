# XRules Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        XRules Platform                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │  xrules-studio  │    │   Web/Mobile    │    │   3rd Party │ │
│  │   (Next.js)     │◄──►│     Clients     │◄───│    APIs     │ │
│  │   Port: 3000    │    │                 │    │             │ │
│  └────────┬────────┘    └─────────────────┘    └─────────────┘ │
│           │                                                      │
│           │ HTTP/WebSocket                                       │
│           ▼                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              xrules-engine (Rust Hub)                    │   │
│  │                   Port: 50051/50060                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │   │
│  │  │  HTTP API   │  │   gRPC      │  │  JWT Auth/RBAC  │ │   │
│  │  │   (Axum)    │  │   (Tonic)   │  │                 │ │   │
│  │  └──────┬──────┘  └─────────────┘  └─────────────────┘ │   │
│  │         │                                                │   │
│  │  ┌──────▼────────────────────────────────────────┐      │   │
│  │  │              Engine Hub (Router)               │      │   │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐│      │   │
│  │  │  │  Rules  │ │  PMML   │ │   ML    │ │  LLM   ││      │   │
│  │  │  │ (Rust)  │ │   (R)   │ │(Python) │ │(Python)││      │   │
│  │  │  │ :50051  │ │ :50052  │ │ :50053  │ │ :50054 ││      │   │
│  │  │  └─────────┘ └─────────┘ └─────────┘ ├────────┤│      │   │
│  │  │                                      │   AI   ││      │   │
│  │  │                                      │(Python) ││      │   │
│  │  │                                      │ :50055  ││      │   │
│  │  │                                      └────────┘│      │   │
│  │  └────────────────────────────────────────────────┘      │   │
│  └─────────────────────────────────────────────────────────┘   │
│           │                                                      │
│           │ SQL/gRPC/HTTP                                        │
│           ▼                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Data Layer                            │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │  PostgreSQL  │  │ TimescaleDB  │  │    Kafka     │  │   │
│  │  │   (Rules)    │  │ (Analytics)  │  │   (Events)   │  │   │
│  │  │   :5432      │  │    :5434     │  │   :9092      │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Frontend (xrules-studio)
- **Framework**: Next.js 14 with App Router
- **Port**: 3000
- **Features**:
  - Visual Rule Editor (DMN tables)
  - Model Management UI
  - Execution Dashboard
  - Analytics & Reporting
  - User Management (RBAC)

### 2. Engine Hub (xrules-engine)
- **Language**: Rust
- **Ports**: 50051 (HTTP), 50060 (gRPC)
- **Responsibilities**:
  - Route requests to appropriate engine
  - JWT authentication & RBAC
  - Request validation
  - Audit logging
  - Protocol translation (HTTP ↔ gRPC)

### 3. Engine Registry

| Engine | Language | Port | Standards | Use Case |
|--------|----------|------|-----------|----------|
| Rules | Rust | 50051 | DMN 1.4, JSON | Business rules, decision tables |
| PMML | R | 50052 | PMML 4.4 | Scoring models, regression |
| ML | Python | 50053 | ONNX, Pickle | Scikit-learn models |
| LLM | Python | 50054 | OpenAI API | GPT/Claude inference |
| AI | Python | 50055 | ONNX, PyTorch | Deep learning models |

### 4. Data Layer

#### PostgreSQL (Primary Database)
- Rule definitions
- User management
- Execution history
- Audit logs

#### TimescaleDB (Analytics)
- Time-series metrics
- Performance monitoring
- Execution statistics

#### Kafka (Event Streaming)
- Async rule execution
- Event sourcing
- Integration with external systems

## Request Flow

```
1. Client → Hub (HTTP/gRPC)
   └─ JWT validation
   └─ Rate limiting

2. Hub → Engine Router
   └─ Load rule from DB
   └─ Determine target engine

3. Router → Engine
   └─ Transform request format
   └─ Execute rule logic

4. Engine → Hub
   └─ Return result
   └─ Engine-specific metrics

5. Hub → Client
   └─ Format response
   └─ Log audit trail
```

## Authentication Flow

```
┌────────┐         ┌─────────────┐         ┌────────┐
│ Client │────────►│ AuthService │────────►│  DB    │
└────────┘         └─────────────┘         └────────┘
     │                    │                     │
     │ 1. POST /login     │                     │
     │────────────────────►                     │
     │                    │ 2. Verify creds     │
     │                    │────────────────────►
     │                    │                     │
     │                    │ 3. Return user      │
     │                    │◄────────────────────│
     │                    │                     │
     │ 4. Generate tokens │                     │
     │◄────────────────────                     │
     │                    │                     │
     │ 5. Use access token for API calls        │
     │────────────────────────────────────────►│
```

## Security

### JWT Token Structure
```json
{
  "sub": "user-uuid",
  "username": "admin",
  "email": "admin@xrules.io",
  "roles": ["Admin", "Editor"],
  "iat": 1706745600,
  "exp": 1706749200,
  "iss": "xrules-engine",
  "aud": "xrules-api",
  "jti": "unique-token-id"
}
```

### RBAC Matrix

| Endpoint | Viewer | Editor | Admin | Service |
|----------|--------|--------|-------|---------|
| GET /engines | ✅ | ✅ | ✅ | ✅ |
| POST /execute | ✅ | ✅ | ✅ | ✅ |
| POST /validate | ❌ | ✅ | ✅ | ✅ |
| POST /rules | ❌ | ✅ | ✅ | ❌ |
| DELETE /rules | ❌ | ❌ | ✅ | ❌ |
| GET /admin/* | ❌ | ❌ | ✅ | ❌ |

## Scalability

### Horizontal Scaling
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  NGINX LB   │────►│  Hub Pod 1  │     │  Hub Pod 2  │
│  (Ingress)  │     │  (Rust)     │◄───►│  (Rust)     │
└─────────────┘     └──────┬──────┘     └──────┬──────┘
                           │                    │
                    ┌──────┴──────┐      ┌──────┴──────┐
                    │  Redis      │◄────►│  PostgreSQL │
                    │  (Session)  │      │  (Primary)  │
                    └─────────────┘      └─────────────┘
```

### Engine Scaling
- Each engine can be scaled independently
- Hub uses round-robin load balancing
- Health checks for engine selection

## Monitoring

### Metrics (Prometheus)
- Request latency (p50, p95, p99)
- Engine utilization
- Error rates
- JWT token cache hit rate

### Logging (ELK Stack)
- Structured JSON logs
- Correlation IDs
- Audit trails
- Error tracking

### Tracing (Jaeger)
- Distributed tracing
- Request flow visualization
- Performance bottlenecks

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js, React, TypeScript, TailwindCSS |
| API Gateway | Axum (Rust), Tower |
| gRPC | Tonic, Prost |
| Auth | jsonwebtoken, bcrypt |
| Database | PostgreSQL, TimescaleDB, sqlx |
| Message Queue | Apache Kafka |
| Caching | Redis |
| Monitoring | Prometheus, Grafana, Jaeger |
| Deployment | Docker, Kubernetes, Helm |
