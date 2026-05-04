# XRules Engine Development Roadmap

> สถานะปัจจุบัน: MVP Phase 1 (Core Engine) ✅ เสร็จสมบูรณ์  
> เป้าหมาย: Production-Ready Rule Engine Platform

## 📊 Current Status (สิ่งที่มีแล้ว)

### ✅ Core Engine (100%)
- [x] Engine Hub (Rust) - HTTP (50051) + gRPC (50060)
- [x] 5 Engine Types: Rules, PMML, ML, LLM, AI
- [x] DMN 1.4 Decision Tables (FIRST, UNIQUE, COLLECT, ANY)
- [x] JWT Authentication (RBAC: Admin/Editor/Viewer/Service)
- [x] gRPC Unary + Bidirectional Streaming
- [x] OpenAPI 3.1 + Swagger UI
- [x] Unit/Integration Tests (115 tests)

### ✅ Infrastructure (80%)
- [x] PostgreSQL (Primary DB)
- [x] TimescaleDB (Analytics)
- [x] Docker Compose setup
- [x] Health check endpoints
- [ ] Redis (Caching)
- [ ] Kafka (Event Streaming)

---

## 🚀 Phase 2: Rule Management (Priority: HIGH)

### 2.1 Rule CRUD API
**Status:** ❌ Not Started | **Priority:** 🔴 Critical

```
POST   /api/v1/rules              # Create new rule
GET    /api/v1/rules              # List all rules
GET    /api/v1/rules/{id}         # Get rule by ID
PUT    /api/v1/rules/{id}         # Update rule
DELETE /api/v1/rules/{id}         # Delete rule (soft delete)
POST   /api/v1/rules/{id}/clone   # Clone existing rule
```

**Database Schema:**
```sql
CREATE TABLE rules (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    engine_type VARCHAR(50) NOT NULL, -- rules, pmml, ml, llm, ai
    content JSONB NOT NULL,           -- DMN table / ML model config / etc.
    version INTEGER DEFAULT 1,
    status VARCHAR(20) DEFAULT 'draft', -- draft, active, deprecated, archived
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    tags TEXT[],
    metadata JSONB
);
```

**Files to Create:**
- `src/api/rules.rs` - Rule CRUD handlers
- `src/models/rule.rs` - Rule model
- `src/repositories/rule_repository.rs` - Data access layer
- `tests/integration/rule_api_tests.rs`

---

### 2.2 Rule Versioning
**Status:** ❌ Not Started | **Priority:** 🔴 Critical

```
GET    /api/v1/rules/{id}/versions           # List versions
GET    /api/v1/rules/{id}/versions/{version} # Get specific version
POST   /api/v1/rules/{id}/rollback           # Rollback to version
POST   /api/v1/rules/{id}/compare            # Compare versions
```

**Features:**
- Auto-increment version on update
- Version history tracking
- Diff visualization
- Rollback capability

---

### 2.3 Rule Lifecycle Management
**Status:** ❌ Not Started | **Priority:** 🟠 High

```
POST /api/v1/rules/{id}/publish    # Publish rule (draft → active)
POST /api/v1/rules/{id}/deprecate  # Deprecate rule
POST /api/v1/rules/{id}/archive    # Archive rule
POST /api/v1/rules/{id}/activate   # Reactivate archived rule
```

**States:**
```
draft → active → deprecated → archived
   ↓       ↓         ↓
 publish  update   delete
```

---

## 🚀 Phase 3: Performance & Reliability (Priority: HIGH)

### 3.1 Redis Caching
**Status:** ❌ Not Started | **Priority:** 🔴 Critical

**Cache Layers:**
```rust
// 1. Rule Definition Cache (TTL: 5 minutes)
GET /api/v1/rules/{id} → Redis → DB (if miss)

// 2. Execution Result Cache (TTL: 1 minute)
Hash(rule_id + input_hash) → result

// 3. Auth Token Cache (TTL: 1 hour)
session_id → claims
```

**Implementation:**
- `src/cache/mod.rs` - Cache abstraction
- `src/cache/redis.rs` - Redis implementation
- `src/middleware/cache.rs` - Cache middleware

---

### 3.2 Circuit Breaker
**Status:** ❌ Not Started | **Priority:** 🟠 High

**For External Engines (PMML, ML, LLM, AI):**
```rust
pub struct CircuitBreaker {
    failure_threshold: u32,      // 5 failures
    recovery_timeout: Duration,  // 30 seconds
    half_open_max_calls: u32,    // 3 test calls
}

// States: Closed → Open → Half-Open → Closed
```

**Actions when Open:**
- Return fallback response
- Queue for retry
- Alert monitoring

---

### 3.3 Rate Limiting
**Status:** ❌ Not Started | **Priority:** 🟠 High

```rust
// Per API Key / User
pub struct RateLimit {
    requests_per_second: u32,
    burst_size: u32,
}

// Different tiers
const TIERS = {
    "free": RateLimit { rps: 10, burst: 20 },
    "pro": RateLimit { rps: 100, burst: 200 },
    "enterprise": RateLimit { rps: 1000, burst: 2000 },
};
```

**Headers:**
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1643723400
```

---

## 🚀 Phase 4: Analytics & Observability (Priority: MEDIUM)

### 4.1 Audit Logging
**Status:** 🟡 Partial | **Priority:** 🟠 High

**Current:** Basic module exists  
**Need:** Full implementation

```rust
pub struct AuditEvent {
    event_id: UUID,
    event_type: AuditEventType,  // RuleExecuted, RuleCreated, Login, etc.
    user_id: Option<UUID>,
    rule_id: Option<UUID>,
    input: Option<Json>,
    output: Option<Json>,
    duration_ms: u64,
    success: bool,
    error_message: Option<String>,
    ip_address: Option<String>,
    user_agent: Option<String>,
    timestamp: DateTime<Utc>,
}
```

**Storage:** TimescaleDB (time-series)

---

### 4.2 Execution Metrics
**Status:** ❌ Not Started | **Priority:** 🟡 Medium

```
GET /api/v1/analytics/executions
GET /api/v1/analytics/engines
GET /api/v1/analytics/rules/{id}/stats
```

**Metrics:**
- Execution count (per rule, per engine)
- Average latency (p50, p95, p99)
- Error rate
- Cache hit rate
- Active rules count

**Grafana Dashboards:**
- Executive Overview
- Engine Performance
- Rule Analytics
- Error Tracking

---

### 4.3 Distributed Tracing
**Status:** ❌ Not Started | **Priority:** 🟢 Low

```rust
// OpenTelemetry + Jaeger
#[tracing::instrument(skip_all, fields(rule_id = %rule_id))]
async fn execute_rule(rule_id: &str, input: Value) -> Result<Value> {
    // Auto-traced
}
```

---

## 🚀 Phase 5: Integration & Import/Export (Priority: MEDIUM)

### 5.1 Rule Import/Export
**Status:** ❌ Not Started | **Priority:** 🟠 High

```
POST /api/v1/rules/import         # Import from file
GET  /api/v1/rules/{id}/export    # Export rule
POST /api/v1/rules/bulk-import    # Bulk import
GET  /api/v1/rules/bulk-export    # Bulk export
```

**Formats:**
| Format | Import | Export | Description |
|--------|--------|--------|-------------|
| JSON | ✅ | ✅ | Native format |
| DMN XML | ✅ | ✅ | DMN 1.4 standard |
| PMML | ✅ | ✅ | PMML 4.4 |
| CSV | ✅ | ❌ | Simple tables |
| Excel | ✅ | ✅ | Business friendly |

---

### 5.2 Webhook Integration
**Status:** ❌ Not Started | **Priority:** 🟡 Medium

```rust
pub struct WebhookConfig {
    url: String,
    events: Vec<WebhookEvent>,  // RuleExecuted, RuleFailed, etc.
    headers: HashMap<String, String>,
    secret: String,  // For HMAC signature
    retry_policy: RetryPolicy,
}
```

---

### 5.3 Kafka Event Streaming
**Status:** 🟡 Partial | **Priority:** 🟡 Medium

**Producer:**
```rust
// Publish execution events
topic: "xrules.executions"
```

**Consumer:**
```rust
// Async rule execution
topic: "xrules.execution.requests"
```

---

## 🚀 Phase 6: Advanced Features (Priority: LOW)

### 6.1 Rule Templates
**Status:** ❌ Not Started | **Priority:** 🟢 Low

**Pre-defined Templates:**
- Loan Eligibility Check
- Fraud Detection
- Customer Segmentation
- Dynamic Pricing
- Risk Scoring

```
GET /api/v1/templates
POST /api/v1/rules/from-template
```

---

### 6.2 A/B Testing for Rules
**Status:** ❌ Not Started | **Priority:** 🟢 Low

```rust
pub struct ABTest {
    rule_id: UUID,
    variants: Vec<RuleVariant>,  // Control + Variants
    traffic_split: Vec<f32>,     // [0.5, 0.5], [0.7, 0.3]
    metrics: Vec<Metric>,
}
```

---

### 6.3 ML Model Management
**Status:** ❌ Not Started | **Priority:** 🟢 Low

```
POST /api/v1/ml-models              # Upload model
GET  /api/v1/ml-models              # List models
POST /api/v1/ml-models/{id}/deploy  # Deploy to ML Engine
GET  /api/v1/ml-models/{id}/metrics # Model performance
```

---

## 🚀 Phase 7: Frontend (xrules-studio) (Priority: MEDIUM)

### 7.1 Rule Editor UI
**Status:** ❌ Not Started | **Priority:** 🔴 Critical

**Pages:**
- `/rules` - Rule list with search/filter
- `/rules/new` - Create rule wizard
- `/rules/{id}` - Rule editor
  - Visual DMN table editor
  - JSON/YAML editor
  - Test panel (execute with sample input)
- `/rules/{id}/versions` - Version history

**Components:**
- DMN Table Editor (React + Handsontable)
- JSON Schema Form (React Hook Form)
- Execution Tester
- Version Diff Viewer

---

### 7.2 Dashboard
**Status:** ❌ Not Started | **Priority:** 🟡 Medium

**Widgets:**
- Total rules count (by status)
- Execution volume (last 24h)
- Top rules by execution count
- Engine health status
- Recent errors

---

## 📋 Development Priority Matrix

| Feature | Impact | Effort | Priority | Phase |
|---------|--------|--------|----------|-------|
| Rule CRUD API | 🔴 High | 🟡 Medium | 🔴 Critical | 2.1 |
| Rule Versioning | 🔴 High | 🟡 Medium | 🔴 Critical | 2.2 |
| Redis Caching | 🔴 High | 🟢 Low | 🔴 Critical | 3.1 |
| Rule Editor UI | 🔴 High | 🔴 High | 🔴 Critical | 7.1 |
| Circuit Breaker | 🟡 Medium | 🟢 Low | 🟠 High | 3.2 |
| Rate Limiting | 🟡 Medium | 🟢 Low | 🟠 High | 3.3 |
| Audit Logging | 🔴 High | 🟢 Low | 🟠 High | 4.1 |
| Rule Import/Export | 🟡 Medium | 🟡 Medium | 🟠 High | 5.1 |
| Analytics API | 🟡 Medium | 🟡 Medium | 🟡 Medium | 4.2 |
| Webhook Integration | 🟢 Low | 🟡 Medium | 🟡 Medium | 5.2 |
| Kafka Streaming | 🟡 Medium | 🔴 High | 🟡 Medium | 5.3 |
| Distributed Tracing | 🟢 Low | 🟡 Medium | 🟢 Low | 4.3 |
| Rule Templates | 🟢 Low | 🟢 Low | 🟢 Low | 6.1 |
| A/B Testing | 🟢 Low | 🔴 High | 🟢 Low | 6.2 |
| ML Model Management | 🟢 Low | 🔴 High | 🟢 Low | 6.3 |

---

## 🎯 Next Immediate Actions (This Week)

### 1. Rule CRUD API (Start Here)
```bash
# Files to create:
src/
├── models/
│   └── rule.rs           # Rule struct, validation
├── repositories/
│   └── rule_repository.rs # Database operations
└── api/
    └── rules.rs          # REST handlers

tests/
└── integration/
    └── rule_api_tests.rs

# Database migration:
migrations/20240223_001_create_rules_table.sql
```

### 2. Redis Caching Setup
```bash
# Add to docker-compose.yml
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
```

### 3. Audit Logging Enhancement
```bash
# Complete the audit module
src/audit/
├── mod.rs
├── service.rs      # Implement
├── repository.rs   # TimescaleDB storage
└── middleware.rs   # Auto-log HTTP requests
```

---

## 📁 Suggested File Structure (Next Phase)

```
apps/xrules-engine/src/
├── main.rs
├── lib.rs
├── config.rs                 # NEW: Centralized config
├── models/                   # NEW: Data models
│   ├── mod.rs
│   ├── rule.rs
│   ├── user.rs
│   └── audit_event.rs
├── repositories/             # NEW: Data access layer
│   ├── mod.rs
│   ├── rule_repository.rs
│   └── audit_repository.rs
├── cache/                    # NEW: Caching layer
│   ├── mod.rs
│   └── redis.rs
├── services/                 # NEW: Business logic
│   ├── mod.rs
│   ├── rule_service.rs
│   └── execution_service.rs
├── api/                      # Existing
│   ├── mod.rs
│   ├── rules.rs              # NEW: Rule CRUD
│   ├── execute.rs            # Existing
│   └── ...
├── engines/                  # Existing (complete)
├── auth/                     # Existing (complete)
├── hub/                      # Existing (complete)
└── audit/                    # Existing (needs completion)
```

---

## 🔗 Dependencies for Next Phase

```toml
# Cargo.toml additions
[dependencies]
# Caching
redis = { version = "0.24", features = ["tokio-comp", "connection-manager"] }

# Rate limiting
governor = "0.2"

# Circuit breaker
backoff = { version = "0.4", features = ["tokio"] }

# Validation
validator = { version = "0.16", features = ["derive"] }

# OpenTelemetry (tracing)
opentelemetry = "0.21"
opentelemetry-jaeger = "0.20"
tracing-opentelemetry = "0.22"

# Time-series data (for analytics)
influxdb = "0.7"
```

---

## ✅ Definition of Done (Each Phase)

- [ ] Code complete with tests (>80% coverage)
- [ ] API documentation updated (OpenAPI)
- [ ] Postman collection updated
- [ ] Docker compose working
- [ ] Integration tests passing
- [ ] Performance benchmarks met
- [ ] Security review passed
- [ ] Documentation updated

---

**Last Updated:** 2024-02-23  
**Current Phase:** 1 (MVP Complete) → Starting Phase 2
