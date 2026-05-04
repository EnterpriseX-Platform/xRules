# XRules API Documentation

## Overview

XRules Platform provides a unified API for rule execution across 5 specialized engines:
- **Rules Engine** (Rust) - DMN 1.4 decision tables
- **PMML Engine** (R) - PMML 4.4 scoring models
- **ML Engine** (Python) - Scikit-learn models
- **LLM Engine** (Python) - OpenAI/Anthropic LLM inference
- **AI Engine** (Python) - PyTorch/TensorFlow deep learning

## Base URLs

| Protocol | URL | Port |
|----------|-----|------|
| HTTP REST | `http://localhost:50051` | 50051 |
| gRPC | `http://localhost:50060` | 50060 |

## Authentication

All protected endpoints require JWT Bearer token:

```http
Authorization: Bearer <access_token>
```

### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

### Refresh Token
```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refresh_token": "<refresh_token>"
}
```

## Endpoints

### Health Check

#### GET /health
Basic health check.

**Response:**
```json
{
  "status": "healthy",
  "version": "0.1.0"
}
```

#### GET /health/live
Liveness probe for Kubernetes.

#### GET /health/ready
Readiness probe.

**Response:**
```json
{
  "ready": true,
  "checks": {
    "database": true,
    "engines": ["rules", "pmml", "ml", "llm", "ai"]
  }
}
```

### Engines

#### GET /api/v1/engines
List all available engines.

**Auth:** Required (Viewer+)

**Response:**
```json
[
  {
    "name": "Rules Engine",
    "engine_type": "rules",
    "status": "healthy",
    "standards": ["DMN", "JSON"],
    "version": "1.0.0"
  }
]
```

### Rule Execution

#### POST /api/v1/execute
Execute a rule with given input.

**Auth:** Required (Viewer+)

**Request:**
```json
{
  "rule_id": "loan-decision-1",
  "input": {
    "applicant": {
      "age": 35,
      "income": 75000,
      "credit_score": 720
    },
    "loan": {
      "amount": 200000
    }
  },
  "context": {
    "tenant_id": "tenant-1"
  }
}
```

**Response:**
```json
{
  "success": true,
  "output": {
    "decision": "approved",
    "interest_rate": 3.5
  },
  "error": null,
  "duration_ms": 150,
  "engine_used": "rules"
}
```

#### POST /api/v1/execute/batch
Execute multiple rules in batch.

**Request:**
```json
{
  "requests": [
    {"rule_id": "rule-1", "input": {"value": 100}},
    {"rule_id": "rule-2", "input": {"value": 200}}
  ]
}
```

### Validation

#### POST /api/v1/validate/{rule_id}
Validate a rule definition.

**Response:**
```json
{
  "valid": true,
  "errors": []
}
```

### Documentation

#### GET /api/v1/openapi.json
OpenAPI 3.1 specification.

#### GET /docs
Swagger UI documentation.

## gRPC Services

### Engine Service

```protobuf
service EngineService {
  // Unary RPC
  rpc Execute(ExecuteRequest) returns (ExecuteResponse);
  
  // Server streaming
  rpc StreamExecute(stream ExecuteRequest) returns (stream ExecuteResponse);
  
  // Bidirectional streaming
  rpc BidirectionalStream(stream StreamRequest) returns (stream StreamResponse);
}
```

### Message Types

```protobuf
message ExecuteRequest {
  string rule_id = 1;
  string input = 2;      // JSON string
  string context = 3;    // Optional JSON string
}

message ExecuteResponse {
  bool success = 1;
  string output = 2;     // JSON string
  string error = 3;
  uint64 duration_ms = 4;
  string engine_used = 5;
}
```

## Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | BAD_REQUEST | Invalid request format |
| 401 | UNAUTHORIZED | Missing or invalid token |
| 403 | FORBIDDEN | Insufficient permissions |
| 404 | NOT_FOUND | Rule not found |
| 422 | UNPROCESSABLE | Rule validation failed |
| 500 | INTERNAL_ERROR | Server error |

## Rate Limiting

- Authentication: 5 requests/minute per IP
- Rule Execution: 1000 requests/minute per API key

## SDK Examples

### cURL
```bash
# Login
curl -X POST http://localhost:50051/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Execute rule
curl -X POST http://localhost:50051/api/v1/execute \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"rule_id":"test-rule","input":{"age":30}}'
```

### Python
```python
import requests

# Login
resp = requests.post("http://localhost:50051/api/v1/auth/login", json={
    "username": "admin",
    "password": "admin123"
})
token = resp.json()["access_token"]

# Execute rule
resp = requests.post(
    "http://localhost:50051/api/v1/execute",
    headers={"Authorization": f"Bearer {token}"},
    json={
        "rule_id": "loan-decision",
        "input": {"age": 35, "income": 75000}
    }
)
print(resp.json())
```

### JavaScript/TypeScript
```typescript
// Login
const loginRes = await fetch('http://localhost:50051/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' })
});
const { access_token } = await loginRes.json();

// Execute rule
const execRes = await fetch('http://localhost:50051/api/v1/execute', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    rule_id: 'loan-decision',
    input: { age: 35, income: 75000 }
  })
});
const result = await execRes.json();
```

## WebSocket (Future)

Real-time rule updates:
```javascript
const ws = new WebSocket('ws://localhost:50051/ws/rules');
ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  console.log('Rule updated:', update);
};
```
