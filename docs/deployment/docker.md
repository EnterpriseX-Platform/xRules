# Docker Deployment Guide

## Prerequisites

- Docker Engine 24.0+
- Docker Compose 2.20+
- 8GB+ RAM available
- Ports 3000, 50051-50055, 5432, 5434, 9092 available

## Quick Start

```bash
# Clone repository
git clone <repo-url>
cd XRULES

# Start all services
docker-compose up -d

# Verify services
./scripts/verify-deployment.sh
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| xrules-studio | 3000 | Next.js frontend |
| xrules-engine | 50051/50060 | Rust Engine Hub (HTTP/gRPC) |
| pmml-engine | 50052 | R-based PMML engine |
| ml-engine | 50053 | Python ML engine |
| llm-engine | 50054 | Python LLM engine |
| ai-engine | 50055 | Python AI engine |
| postgres | 5432 | Primary database |
| timescaledb | 5434 | Time-series analytics |
| kafka | 9092 | Event streaming |
| grafana | 3001 | Monitoring dashboards |

## docker-compose.yml

```yaml
version: '3.8'

services:
  # Frontend
  xrules-studio:
    build: ./apps/xrules-studio
    ports:
      - "3000:3000"
    environment:
      - API_URL=http://xrules-engine:50051
    depends_on:
      - xrules-engine

  # Rust Engine Hub
  xrules-engine:
    build: ./apps/xrules-engine
    ports:
      - "50051:50051"
      - "50060:50060"
    environment:
      - DATABASE_URL=postgres://postgres:postgres@postgres:5432/xrules
      - TIMESCALE_URL=postgres://postgres:postgres@timescaledb:5432/analytics
      - KAFKA_BROKER=kafka:9092
      - JWT_SECRET=${JWT_SECRET:-changeme}
    depends_on:
      - postgres
      - timescaledb
      - kafka

  # PMML Engine (R)
  pmml-engine:
    build: ./apps/pmml-engine
    ports:
      - "50052:5000"
    environment:
      - HUB_URL=http://xrules-engine:50051

  # ML Engine (Python)
  ml-engine:
    build: ./apps/ml-engine
    ports:
      - "50053:5000"
    environment:
      - HUB_URL=http://xrules-engine:50051
      - MODEL_PATH=/models
    volumes:
      - ./models/ml:/models:ro

  # LLM Engine (Python)
  llm-engine:
    build: ./apps/llm-engine
    ports:
      - "50054:5000"
    environment:
      - HUB_URL=http://xrules-engine:50051
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}

  # AI Engine (Python)
  ai-engine:
    build: ./apps/ai-engine
    ports:
      - "50055:5000"
    environment:
      - HUB_URL=http://xrules-engine:50051
      - MODEL_PATH=/models
    volumes:
      - ./models/ai:/models:ro
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  # Databases
  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=xrules
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"

  timescaledb:
    image: timescale/timescaledb:latest-pg16
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=analytics
    volumes:
      - timescale_data:/var/lib/postgresql/data
    ports:
      - "5434:5432"

  # Kafka
  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"
    environment:
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1

  # Monitoring
  grafana:
    image: grafana/grafana:10.0.0
    ports:
      - "3001:3000"
    volumes:
      - ./k8s/grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./k8s/grafana/datasources:/etc/grafana/provisioning/datasources
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin

volumes:
  postgres_data:
  timescale_data:
```

## Environment Variables

Create `.env` file:

```bash
# Required
JWT_SECRET=your-super-secret-key-min-32-chars

# Optional - for LLM features
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Optional - custom ports
HTTP_PORT=50051
GRPC_PORT=50060
STUDIO_PORT=3000

# Optional - database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=xrules
```

## Deployment Commands

### Development
```bash
# Start with hot-reload
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# View logs
docker-compose logs -f xrules-engine

# Restart service
docker-compose restart xrules-engine
```

### Production
```bash
# Start in detached mode
docker-compose up -d

# Scale engine instances
docker-compose up -d --scale ml-engine=3

# Update single service
docker-compose up -d --build xrules-engine
```

### Maintenance
```bash
# Backup databases
docker-compose exec postgres pg_dump -U postgres xrules > backup.sql

# View metrics
curl http://localhost:50051/metrics

# Health check
curl http://localhost:50051/health
```

## Troubleshooting

### Port Conflicts
```bash
# Check port usage
lsof -i :50051

# Use different ports in .env
HTTP_PORT=8080
```

### Database Connection Failed
```bash
# Reset databases
docker-compose down -v
docker-compose up -d postgres timescaledb

# Wait for init
sleep 10
./scripts/init-db.sh
```

### Engine Not Responding
```bash
# Check engine health
for port in 50051 50052 50053 50054 50055; do
  curl -s http://localhost:$port/health || echo "Port $port down"
done

# Restart all engines
docker-compose restart xrules-engine pmml-engine ml-engine llm-engine ai-engine
```

### Memory Issues
```bash
# View resource usage
docker stats

# Add swap (Linux)
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

## Kubernetes Deployment

For production Kubernetes deployment:

```bash
# Apply manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/timescaledb/
kubectl apply -f k8s/kafka/
kubectl apply -f k8s/xrules-engine/
kubectl apply -f k8s/xrules-studio/
kubectl apply -f k8s/ingress.yaml

# Verify
kubectl get pods -n xrules
kubectl get svc -n xrules
```

See [k8s/](../../k8s/) directory for complete Kubernetes manifests.

## Security Checklist

- [ ] Change default JWT_SECRET
- [ ] Use strong PostgreSQL password
- [ ] Enable TLS/SSL certificates
- [ ] Configure firewall rules
- [ ] Set up log aggregation
- [ ] Enable database encryption
- [ ] Use secrets management (Vault/AWS Secrets)
- [ ] Regular security updates

## Performance Tuning

### Rust Engine
```bash
# Increase worker threads
WORKER_THREADS=16

# Enable connection pooling
DB_POOL_MAX=100
```

### Python Engines
```bash
# Increase workers
UVICORN_WORKERS=4

# Enable JIT (Numba)
NUMBA_CACHE_DIR=/tmp/numba_cache
```

### Database
```sql
-- PostgreSQL tuning
ALTER SYSTEM SET max_connections = '200';
ALTER SYSTEM SET shared_buffers = '2GB';
ALTER SYSTEM SET effective_cache_size = '6GB';
```

## Monitoring Setup

Access monitoring tools:
- Grafana: http://localhost:3001 (admin/admin)
- Prometheus: http://localhost:9090
- Jaeger: http://localhost:16686

## Next Steps

1. Configure external identity provider (Keycloak/Auth0)
2. Set up CI/CD pipeline
3. Configure backup schedules
4. Set up alerting rules
5. Load testing with k6
