# XRules Engine Test Suite

Comprehensive test suite for the XRules Engine Hub with support for all 5 engines (Rules, PMML, ML, LLM, AI) and JWT authentication.

## Test Summary

| Category | Count | Description |
|----------|-------|-------------|
| **Unit Tests** | 41 | Fast, isolated tests for core components |
| **Integration Tests** | 33 | HTTP API and gRPC endpoint tests |
| **E2E Tests** | 9 | Complete workflow tests |
| **Main Tests** | 2 | Test utilities |
| **Total** | **85** | All tests passing |

## Test Structure

```
tests/
├── mod.rs                          # Test utilities and common setup
├── README.md                       # This file
├── unit/                           # Unit tests
│   ├── mod.rs
│   ├── auth_tests.rs               # JWT authentication (19 tests)
│   ├── hub_tests.rs                # Engine Hub (15 tests)
│   └── engine_tests.rs             # Rule engines (10 tests)
├── integration/                    # Integration tests
│   ├── mod.rs
│   ├── api_tests.rs                # HTTP API (16 tests)
│   ├── auth_integration_tests.rs   # Auth flow (10 tests)
│   └── grpc_tests.rs               # gRPC (11 tests - placeholders)
└── e2e/                            # End-to-end tests
    ├── mod.rs
    └── workflow_tests.rs           # Complete workflows (9 tests)
```

## Running Tests

### Run all tests
```bash
cargo test
```

### Run unit tests only
```bash
cargo test unit
```

### Run integration tests only
```bash
cargo test integration
```

### Run e2e tests only
```bash
cargo test e2e
```

### Run with output
```bash
cargo test -- --nocapture
```

### Run specific test
```bash
cargo test test_auth_service_authenticate_success
```

### Skip gRPC tests
```bash
SKIP_GRPC_TESTS=1 cargo test
```

## Test Categories

### Unit Tests (`tests/unit/`)
Fast, isolated tests with no external dependencies.

**Auth Tests (19)**
- JWT claims creation and validation
- Token expiration checking
- Role-based access control
- Auth service authentication
- Token refresh flow
- Token revocation

**Hub Tests (15)**
- Engine type parsing and display
- ExecuteRequest/Response serialization
- Standard definition handling
- EngineInfo serialization

**Engine Tests (10)**
- Engine error handling
- DMN table evaluation logic
- JSON transformation
- Condition evaluation
- PMML regression scoring

### Integration Tests (`tests/integration/`)
Tests HTTP API and gRPC endpoints.

**API Tests (16)**
- Health endpoints (`/health`, `/health/live`, `/health/ready`)
- OpenAPI documentation (`/api/v1/openapi.json`, `/docs`)
- Engine listing (`/api/v1/engines`)
- Rule execution (`/api/v1/execute`)
- Batch execution (`/api/v1/execute/batch`)
- Rule validation (`/api/v1/validate`)
- Error handling (404, 401, method not allowed)

**Auth Integration Tests (10)**
- Login with various user roles (admin, editor, viewer)
- Invalid credentials handling
- Token refresh flow
- Protected endpoint access control
- Role-based access verification
- Logout functionality

**gRPC Tests (11)**
- Health check
- Unary RPC execute
- Bidirectional streaming
- Streaming error handling
- LLM streaming
- Concurrent request handling
- Large payload handling

### E2E Tests (`tests/e2e/`)
Complete workflow tests from authentication through execution.

**Workflow Tests (9)**
- Complete auth workflow (login → use → refresh → logout)
- Rules engine workflow (DMN decision)
- ML engine workflow (churn prediction)
- PMML engine workflow (risk scoring)
- LLM engine workflow (document analysis)
- AI engine workflow (fraud detection)
- Chained rules workflow (multiple engines)
- Batch processing workflow
- Role-based access workflow

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TEST_SERVER_URL` | HTTP test server URL | `http://127.0.0.1:50051` |
| `GRPC_SERVER_URL` | gRPC server URL | `http://127.0.0.1:50060` |
| `SKIP_GRPC_TESTS` | Skip gRPC integration tests | unset |
| `RUST_LOG` | Log level (debug, info, warn, error) | info |

## Mock Data

Tests use the following mock users:

| Username | Password | Roles |
|----------|----------|-------|
| `admin` | `admin123` | Admin, Editor, Viewer |
| `editor` | `editor123` | Editor, Viewer |
| `viewer` | `viewer123` | Viewer |

## Test Isolation

- Unit tests do not require any external services
- Integration tests gracefully skip when server is unavailable
- E2E tests skip when authentication fails
- Tests can be run in parallel (they are independent)

## Coverage

To generate test coverage report:

```bash
cargo install cargo-tarpaulin
cargo tarpaulin --out Html
```

## Continuous Integration

Recommended CI configuration:

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-action@stable
      
      - name: Run unit tests
        run: cargo test unit --verbose
      
      - name: Run integration tests
        run: cargo test integration --verbose
        env:
          TEST_SERVER_URL: http://localhost:50051
      
      - name: Generate coverage
        run: |
          cargo install cargo-tarpaulin
          cargo tarpaulin --out Xml
```

## Adding New Tests

### Unit Test Example
```rust
#[test]
fn test_my_feature() {
    // Arrange
    let input = create_test_data();
    
    // Act
    let result = my_function(input);
    
    // Assert
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), expected);
}
```

### Integration Test Example
```rust
#[tokio::test]
async fn test_api_endpoint() {
    let client = create_client();
    let token = get_auth_token(&client, "admin", "admin123").await;
    
    match token {
        Some(t) => {
            let resp = client
                .get("http://localhost:50051/api/v1/engines")
                .bearer_auth(t)
                .send()
                .await;
            
            assert!(resp.unwrap().status().is_success());
        }
        None => println!("Skipping - server not available"),
    }
}
```

## Troubleshooting

### Tests fail with connection refused
The integration/e2e tests require the server to be running. Start the server with:
```bash
cargo run
```

### Tests timeout
Increase the timeout in `create_client()` or set a longer test timeout:
```bash
cargo test -- --timeout 120
```

### Authentication failures
Make sure the test users (admin/admin123, editor/editor123, viewer/viewer123) are configured in the auth service.
