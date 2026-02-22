# XRules Engine

High-performance execution engine for rules/flows in a SaaS Decision Management Platform.

## Features

- **Async Execution**: Tokio-based with configurable worker pool
- **gRPC API**: High-performance RPC for flow execution
- **DAG Traversal**: Full support for complex flow graphs
- **Fan-out/Fan-in**: Parallel branch execution with aggregation
- **Scheduling**: Cron-based flow scheduling
- **Real-time Logs**: Streaming execution logs via gRPC
- **Error Handling**: Retry logic and dead letter queue
- **Caching**: Redis for rule definitions and connections
- **Observability**: Tracing and Prometheus metrics

## Supported Node Types

- **API Input/Output**: HTTP request/response handling
- **Database**: PostgreSQL, MySQL, SQLite support via SQLx
- **HTTP Request**: External API calls with retry
- **Condition**: Expression-based branching
- **Transform**: JSON transformation with Handlebars templates
- **SFTP**: File transfer operations
- **Delay**: Execution pausing
- **Aggregate Split/Join**: Parallel processing patterns

## Quick Start

### Prerequisites

- Rust 1.75+
- PostgreSQL 14+
- Redis 7+
- Kafka (optional, for event streaming)

### Installation

```bash
# Clone the repository
git clone https://github.com/xrules/xrules-engine.git
cd xrules-engine

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
sqlx migrate run

# Build and run
cargo run --release
```

### Docker Deployment

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f xrules-engine

# Stop services
docker-compose down
```

## Configuration

Environment variables (see `.env.example`):

| Variable | Description | Default |
|----------|-------------|---------|
| `ENGINE_HOST` | Server bind address | `0.0.0.0` |
| `ENGINE_PORT` | gRPC server port | `50051` |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `REDIS_URL` | Redis connection string | - |
| `KAFKA_BROKERS` | Kafka bootstrap servers | - |
| `LOG_LEVEL` | Logging level | `info` |
| `EXECUTION_TIMEOUT_SECONDS` | Default execution timeout | `300` |

## gRPC API

The engine exposes a gRPC API defined in `proto/engine.proto`:

- `ExecuteFlow`: Execute a flow synchronously
- `ExecuteFlowStreaming`: Execute a flow with streaming logs
- `ValidateFlow`: Validate a flow definition
- `GetExecutionStatus`: Get execution status
- `CancelExecution`: Cancel a running execution

### Example Client (Go)

```go
conn, err := grpc.Dial("localhost:50051", grpc.WithInsecure())
if err != nil {
    log.Fatal(err)
}
defer conn.Close()

client := pb.NewExecutionEngineClient(conn)
resp, err := client.ExecuteFlow(ctx, &pb.ExecuteFlowRequest{
    FlowId:         "uuid",
    ProjectId:      "uuid",
    FlowDefinition: flowJSON,
    InputData:      inputJSON,
})
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    gRPC Server                          │
├─────────────────────────────────────────────────────────┤
│                   Execution Engine                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Executor   │  │  Scheduler   │  │ Worker Pool  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
├─────────────────────────────────────────────────────────┤
│                 Node Executors                           │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐│
│  │  API   │ │Database│ │  HTTP  │ │Condition││Transform││
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘│
├─────────────────────────────────────────────────────────┤
│                   Data Stores                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  PostgreSQL  │  │    Redis     │  │    Kafka     │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Development

### Building

```bash
# Debug build
cargo build

# Release build
cargo build --release

# Run tests
cargo test
```

### Code Structure

```
src/
├── main.rs              # Application entry point
├── lib.rs               # Library exports
├── config.rs            # Configuration management
├── engine/              # Core execution engine
│   ├── executor.rs      # Flow executor
│   ├── context.rs       # Execution context
│   ├── scheduler.rs     # Cron scheduler
│   └── worker.rs        # Worker pool
├── nodes/               # Node executors
│   ├── api_input.rs
│   ├── api_output.rs
│   ├── database.rs
│   ├── http_request.rs
│   ├── condition.rs
│   ├── transform.rs
│   ├── sftp.rs
│   ├── delay.rs
│   ├── aggregate_split.rs
│   └── aggregate_join.rs
├── executors/           # External connection executors
│   ├── database_executor.rs
│   ├── http_executor.rs
│   ├── sftp_executor.rs
│   └── transform_executor.rs
├── stores/              # Data persistence
│   ├── execution_store.rs
│   ├── log_store.rs
│   └── rule_store.rs
├── server/              # gRPC server
│   ├── grpc_server.rs
│   └── health.rs
└── utils/               # Utilities
    ├── crypto.rs
    └── json.rs
```

## Metrics

The engine exposes Prometheus metrics on port 9090:

- `xrules_executions_total`: Total number of executions
- `xrules_execution_duration_seconds`: Execution duration histogram
- `xrules_execution_errors_total`: Total execution errors
- `xrules_active_executions`: Currently running executions

## License

MIT License - see LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Support

For support, email support@xrules.io or join our Slack channel.
