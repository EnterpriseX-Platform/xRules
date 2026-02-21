# XRULES Development Guide

Development environment setup with Docker Compose.

## 🚀 Quick Start

### Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- 8GB+ RAM
- 20GB+ free disk space

### 1. Clone and Setup

```bash
git clone <repository>
cd xrules

# Copy environment file
cp .env.dev .env

# Edit if needed
nano .env
```

### 2. Start Development Environment

```bash
# Build and start all services
./scripts/dev-build.sh
```

This will:
1. Build all Docker images
2. Start PostgreSQL, Redis
3. Run database migrations
4. Start Engine (Rust) with hot reload
5. Start API (Go) with hot reload
6. Start Studio (Next.js) with hot reload

### 3. Access Services

| Service | URL | Description |
|---------|-----|-------------|
| **Studio (UI)** | http://localhost:3000 | Next.js 14 Dev Server |
| **API** | http://localhost:8080 | Go Fiber API |
| **API Health** | http://localhost:8080/health | Health check |
| **Engine gRPC** | localhost:50051 | Rust gRPC |
| **Engine Metrics** | http://localhost:9090 | Prometheus metrics |
| **PostgreSQL** | localhost:5432 | Database |
| **Redis** | localhost:6379 | Cache |

## 🛠️ Development Commands

### View Logs

```bash
# All services
./scripts/dev-logs.sh

# Specific service
./scripts/dev-logs.sh api
./scripts/dev-logs.sh engine
./scripts/dev-logs.sh studio
```

### Stop Services

```bash
./scripts/dev-stop.sh
```

### Clean Up (WARNING: Deletes data!)

```bash
./scripts/dev-clean.sh
```

### Manual Docker Commands

```bash
# Build specific service
docker-compose -f docker-compose.dev.yml build xrules-api

# Restart service
docker-compose -f docker-compose.dev.yml restart xrules-api

# Scale service
docker-compose -f docker-compose.dev.yml up -d --scale xrules-api=3

# Execute command in container
docker-compose -f docker-compose.dev.yml exec xrules-api sh

# View container stats
docker-compose -f docker-compose.dev.yml ps
```

## 🔥 Hot Reload

All services support hot reload:

### xrules-studio (Next.js)
- Edit files in `xrules-studio/`
- Automatic browser refresh
- No container restart needed

### xrules-api (Go)
- Edit files in `xrules-api/`
- Air automatically rebuilds
- ~1-2 second delay

### xrules-engine (Rust)
- Edit files in `xrules-engine/src/`
- Cargo watch rebuilds
- ~5-10 second delay

## 🗄️ Database

### Connect to PostgreSQL

```bash
# Via docker
docker-compose -f docker-compose.dev.yml exec postgres psql -U xrules -d xrules

# Via local client
psql postgresql://xrules:xrules_dev_secret@localhost:5432/xrules
```

### Run Migrations

```bash
# API migrations
docker-compose -f docker-compose.dev.yml exec xrules-api go run cmd/migrate/main.go

# Engine migrations
docker-compose -f docker-compose.dev.yml exec xrules-engine cargo sqlx migrate run
```

### Reset Database

```bash
# Stop and remove volume
./scripts/dev-clean.sh

# Or manually
docker-compose -f docker-compose.dev.yml down -v postgres
docker volume rm xrules_postgres_dev_data
```

## 🔧 Environment Variables

Edit `.env` file to customize:

```bash
# Database
POSTGRES_USER=xrules
POSTGRES_PASSWORD=xrules_dev_secret

# JWT
JWT_SECRET=your-secret-key

# External APIs
OPENAI_API_KEY=sk-...
```

## 🐛 Debugging

### Studio (Next.js)

```bash
# Enter container
docker-compose -f docker-compose.dev.yml exec xrules-studio sh

# View logs
npm run dev
```

### API (Go)

```bash
# Enter container
docker-compose -f docker-compose.dev.yml exec xrules-api sh

# Run with debugger (delve)
dlv debug cmd/server/main.go
```

### Engine (Rust)

```bash
# Enter container
docker-compose -f docker-compose.dev.yml exec xrules-engine sh

# Run with backtrace
RUST_BACKTRACE=1 cargo run
```

## 🧪 Testing

### Run Tests

```bash
# API tests
docker-compose -f docker-compose.dev.yml exec xrules-api go test ./...

# Engine tests
docker-compose -f docker-compose.dev.yml exec xrules-engine cargo test

# Studio tests
docker-compose -f docker-compose.dev.yml exec xrules-studio npm test
```

## 📊 Monitoring

### Docker Stats

```bash
# View container resource usage
docker stats

# Or via compose
docker-compose -f docker-compose.dev.yml stats
```

### Logs Aggregation

```bash
# Follow all logs with timestamps
docker-compose -f docker-compose.dev.yml logs -f --timestamps

# Last 100 lines
docker-compose -f docker-compose.dev.yml logs --tail=100
```

## 🚀 Production Build

```bash
# Use production compose
docker-compose up -d
```

## ❓ Troubleshooting

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Container Won't Start

```bash
# Check logs
docker-compose -f docker-compose.dev.yml logs xrules-api

# Check container status
docker-compose -f docker-compose.dev.yml ps

# Restart with fresh build
docker-compose -f docker-compose.dev.yml up -d --build xrules-api
```

### Database Connection Failed

```bash
# Check if postgres is healthy
docker-compose -f docker-compose.dev.yml ps postgres

# Restart postgres
docker-compose -f docker-compose.dev.yml restart postgres
```

### Hot Reload Not Working

```bash
# Restart the service
docker-compose -f docker-compose.dev.yml restart xrules-studio

# Check file permissions
ls -la xrules-studio/
```

## 📁 Volume Mounts

The following directories are mounted for development:

| Host | Container | Service |
|------|-----------|---------|
| `./xrules-studio` | `/app` | Studio |
| `./xrules-api` | `/app` | API |
| `./xrules-engine/src` | `/app/src` | Engine |
| `./xrules-engine/proto` | `/app/proto` | Engine |

## 🔄 Updates

### Update Dependencies

```bash
# Studio
docker-compose -f docker-compose.dev.yml exec xrules-studio npm update

# API
docker-compose -f docker-compose.dev.yml exec xrules-api go get -u ./...

# Engine
docker-compose -f docker-compose.dev.yml exec xrules-engine cargo update
```

### Rebuild Images

```bash
# After Dockerfile changes
docker-compose -f docker-compose.dev.yml build --no-cache
```

## 📞 Support

For issues and questions:
- Check logs: `./scripts/dev-logs.sh`
- Review [Troubleshooting](#troubleshooting) section
- Create GitHub issue
