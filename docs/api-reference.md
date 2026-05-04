# API Reference

The XRules backend exposes two API surfaces:

## Public Solver API — auth via API Key

These endpoints are intended for production traffic from your applications. Auth is via `X-API-Key`.

### Execute a rule

```
POST /api/v1/rules/:slugOrId/execute
POST /api/v1/rules/:slugOrId/v/:version/execute   # pin version
```

**Headers**
| Header | Notes |
|---|---|
| `X-API-Key` | required |
| `X-Environment` | optional — pins to env's Release |
| `X-Context-*` | optional — passed as `context` to rule |

**Body** — JSON conforming to the rule's `inputSchema`.

**Response**
```json
{
  "success": true,
  "data": {
    "id": "exec_…",
    "ruleId": "…",
    "ruleVersion": 7,
    "output": { … },
    "duration": 12,
    "status": "SUCCESS"
  }
}
```

### Batch execute

```
POST /api/v1/rules/:slugOrId/batch-execute
{ "inputs": [ {…}, {…} ] }
```

Returns `data: ExecuteResult[]` in input order.

### Per-rule OpenAPI 3.1

```
GET /api/v1/rules/:slugOrId/openapi.json
```

Auto-generated from the rule's input/output schemas. Drop into any OpenAPI tooling.

## Internal / UI API — auth via JWT

These power Studio. Auth via `Authorization: Bearer <jwt>`. Not intended for production traffic.

| Group | Routes |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/signup`, `GET /auth/me` |
| Projects | `/projects`, `/projects/:id` |
| Rules | `/rules`, `/rules/:id`, `/rules/:id/publish`, `/rules/:id/versions`, `/rules/:id/test-cases` |
| Flows | `/flows`, `/flows/:id` |
| Test | `/test-suites`, `/test-suites/:id/run`, `/datasets`, `/scenarios` |
| Sim | `/simulations/diff`, `/simulations/replay`, `/simulations/sweep` |
| Deploy | `/releases`, `/environments`, `/environments/:id/pin` |
| Integrations | `/connections`, `/api-keys`, `/webhooks`, `/api/v1/rules/:id/openapi.json` |
| Tools | `/tools/duplicates/:ruleId`, `/tools/dependencies/:ruleId`, `/tools/drd/:projectId` |
| Assistant | `/assistant/chat` |
| Monitor | `/executions`, `/jobs`, `/dashboard`, `/bi/audit/v2` |

## Rate limiting & quotas

Configurable per API key. Default: unlimited (single-tenant self-host). For SaaS deployments, configure via env or backend config.

## SDKs

The recommended way to call the public API:

- TypeScript / JavaScript: [@xrules/sdk](../sdks/typescript/README.md)
- Python: [xrules](../sdks/python/README.md)
