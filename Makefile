# ==========================================
# XRULES Development Makefile
# ==========================================

.PHONY: help build start stop logs clean test deploy

# Default target
help:
	@echo "XRULES Development Commands"
	@echo "============================"
	@echo ""
	@echo "Setup & Build:"
	@echo "  make build          - Build all development images"
	@echo "  make start          - Start all services"
	@echo "  make dev            - Build and start (full setup)"
	@echo ""
	@echo "Development:"
	@echo "  make logs           - View all logs"
	@echo "  make logs-api       - View API logs"
	@echo "  make logs-engine    - View Engine logs"
	@echo "  make logs-studio    - View Studio logs"
	@echo ""
	@echo "Testing:"
	@echo "  make test           - Run all tests"
	@echo "  make test-api       - Run API tests"
	@echo "  make test-engine    - Run Engine tests"
	@echo ""
	@echo "Database:"
	@echo "  make db-connect     - Connect to PostgreSQL"
	@echo "  make db-reset       - Reset database (WARNING: data loss)"
	@echo ""
	@echo "Cleanup:"
	@echo "  make stop           - Stop all services"
	@echo "  make clean          - Clean volumes and data"
	@echo "  make clean-all      - Full cleanup including images"
	@echo ""
	@echo "Production:"
	@echo "  make prod-build     - Build production images"
	@echo "  make prod-deploy    - Deploy production stack"

# ==========================================
# Development Commands
# ==========================================

# Build all development images
build:
	@echo "🚀 Building development images..."
	@./scripts/dev-build.sh

# Start all services
start:
	@echo "▶️  Starting services..."
	@docker-compose -f docker-compose.dev.yml up -d

# Full development setup
dev: build
	@echo "✅ Development environment ready!"

# Stop all services
stop:
	@echo "🛑 Stopping services..."
	@./scripts/dev-stop.sh

# View all logs
logs:
	@./scripts/dev-logs.sh

# View specific service logs
logs-api:
	@./scripts/dev-logs.sh xrules-api

logs-engine:
	@./scripts/dev-logs.sh xrules-engine

logs-studio:
	@./scripts/dev-logs.sh xrules-studio

logs-postgres:
	@./scripts/dev-logs.sh postgres

logs-redis:
	@./scripts/dev-logs.sh redis

# ==========================================
# Testing Commands
# ==========================================

test:
	@echo "🧪 Running all tests..."
	@docker-compose -f docker-compose.dev.yml exec -T xrules-api go test ./...
	@docker-compose -f docker-compose.dev.yml exec -T xrules-engine cargo test
	@docker-compose -f docker-compose.dev.yml exec -T xrules-studio npm test

test-api:
	@echo "🧪 Running API tests..."
	@docker-compose -f docker-compose.dev.yml exec xrules-api go test ./...

test-engine:
	@echo "🧪 Running Engine tests..."
	@docker-compose -f docker-compose.dev.yml exec xrules-engine cargo test

test-studio:
	@echo "🧪 Running Studio tests..."
	@docker-compose -f docker-compose.dev.yml exec xrules-studio npm test

# ==========================================
# Database Commands
# ==========================================

db-connect:
	@echo "🐘 Connecting to PostgreSQL..."
	@docker-compose -f docker-compose.dev.yml exec postgres psql -U xrules -d xrules

db-reset:
	@echo "⚠️  Resetting database..."
	@docker-compose -f docker-compose.dev.yml down -v postgres
	@docker-compose -f docker-compose.dev.yml up -d postgres
	@echo "✅ Database reset complete"

db-migrate:
	@echo "🔄 Running migrations..."
	@docker-compose -f docker-compose.dev.yml exec xrules-api go run cmd/migrate/main.go

# ==========================================
# Cleanup Commands
# ==========================================

clean:
	@echo "🧹 Cleaning up..."
	@./scripts/dev-clean.sh

clean-all:
	@echo "🧹 Deep cleaning..."
	@docker-compose -f docker-compose.dev.yml down -v --remove-orphans
	@docker-compose -f docker-compose.prod.yml down -v --remove-orphans
	@docker system prune -f
	@echo "✅ Cleanup complete"

# ==========================================
# Production Commands
# ==========================================

prod-build:
	@echo "🏭 Building production images..."
	@docker-compose build

prod-deploy:
	@echo "🚀 Deploying production stack..."
	@docker-compose up -d

# ==========================================
# Utility Commands
# ==========================================

# Enter container shell
shell-api:
	@docker-compose -f docker-compose.dev.yml exec xrules-api sh

shell-engine:
	@docker-compose -f docker-compose.dev.yml exec xrules-engine sh

shell-studio:
	@docker-compose -f docker-compose.dev.yml exec xrules-studio sh

# Restart services
restart-api:
	@docker-compose -f docker-compose.dev.yml restart xrules-api

restart-engine:
	@docker-compose -f docker-compose.dev.yml restart xrules-engine

restart-studio:
	@docker-compose -f docker-compose.dev.yml restart xrules-studio

# View status
status:
	@docker-compose -f docker-compose.dev.yml ps

# Format code
fmt-api:
	@docker-compose -f docker-compose.dev.yml exec xrules-api go fmt ./...

fmt-engine:
	@docker-compose -f docker-compose.dev.yml exec xrules-engine cargo fmt

fmt-studio:
	@docker-compose -f docker-compose.dev.yml exec xrules-studio npm run lint:fix

# Lint code
lint-api:
	@docker-compose -f docker-compose.dev.yml exec xrules-api golangci-lint run

lint-engine:
	@docker-compose -f docker-compose.dev.yml exec xrules-engine cargo clippy

lint-studio:
	@docker-compose -f docker-compose.dev.yml exec xrules-studio npm run lint

# Update dependencies
update-api:
	@docker-compose -f docker-compose.dev.yml exec xrules-api go get -u ./...

update-engine:
	@docker-compose -f docker-compose.dev.yml exec xrules-engine cargo update

update-studio:
	@docker-compose -f docker-compose.dev.yml exec xrules-studio npm update
