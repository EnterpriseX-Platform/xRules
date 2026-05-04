# XRules Platform Documentation

> Centralized documentation for XRules Platform - Rule Engine Management System

## 📚 Documentation Structure

```
docs/
├── README.md                 # This file - Documentation index
├── quickstart.md             # 5-minute install + first rule
├── concepts.md               # Core entities (Workspace · Project · Rule · …)
├── api-reference.md          # Public Solver API + internal API
├── testing/                  # Testing documentation
├── api/                      # OpenAPI generation details
├── architecture/             # System architecture
└── deployment/               # Deployment guides
```

## 🚀 Quick Start

| Topic | Link | Description |
|-------|------|-------------|
| **Quickstart** | [quickstart.md](quickstart.md) | 5-minute install + first rule |
| **Concepts** | [concepts.md](concepts.md) | Workspace · Project · Rule · Flow · Release · Environment |
| **API Reference** | [api-reference.md](api-reference.md) | Public Solver API + internal API |
| **TypeScript SDK** | [../sdks/typescript/README.md](../sdks/typescript/README.md) | `@xrules/sdk` |
| **Python SDK** | [../sdks/python/README.md](../sdks/python/README.md) | `xrules` |
| **Testing** | [testing/engine-tests.md](testing/engine-tests.md) | Complete test suite guide for Rust Engine |
| **OpenAPI** | [api/openapi.md](api/openapi.md) | Per-rule OpenAPI 3.1 generation |
| **Architecture** | [architecture/overview.md](architecture/overview.md) | System design and components |
| **Deployment** | [deployment/docker.md](deployment/docker.md) | Docker Compose deployment |

## 🏗️ Project Structure

```
XRULES/
├── apps/
│   ├── xrules-studio/        # Next.js 14 frontend (Studio)
│   ├── xrules-backend/       # Express + Prisma — CRUD/auth/OpenAPI gen
│   └── xrules-engine/        # Rust pure executor (Axum + Tonic)
├── sdks/
│   ├── typescript/           # @xrules/sdk
│   └── python/               # xrules
├── deploy/
│   ├── docker/               # Service Dockerfiles
│   └── helm/                 # Helm chart for Kubernetes
├── docs/                     # Documentation (this folder)
└── scripts/                  # Dev/setup scripts
```

## 🧪 Testing

Run all tests:
```bash
cd apps/xrules-engine
cargo test
```

See detailed testing guide: [testing/engine-tests.md](testing/engine-tests.md)

## 📖 Contributing to Docs

When adding new documentation:
1. Place in appropriate subfolder (`testing/`, `api/`, `architecture/`, `deployment/`)
2. Use clear, descriptive filenames
3. Update this README with new links
4. Follow Markdown best practices

## 🔗 External References

- [OpenAPI 3.1 Specification](https://spec.openapis.org/oas/v3.1.0)
- [DMN 1.4 Specification](https://www.omg.org/spec/DMN/1.4)
- [PMML 4.4 Specification](http://dmg.org/pmml/v4-4-1/pmml-4-4.xsd)
- [Rust Book](https://doc.rust-lang.org/book/)
- [Axum Documentation](https://docs.rs/axum/latest/axum/)
- [Tonic gRPC](https://docs.rs/tonic/latest/tonic/)
