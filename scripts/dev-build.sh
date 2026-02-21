#!/bin/bash
# ==========================================
# XRULES Development Build Script
# ==========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🚀 XRULES Development Environment Builder"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

cd "$PROJECT_ROOT"

# Check if .env.dev exists
if [ ! -f .env.dev ]; then
    echo -e "${YELLOW}⚠️  .env.dev not found. Creating from template...${NC}"
    cp .env.example .env.dev
fi

# Load environment variables
export $(grep -v '^#' .env.dev | xargs)

echo -e "${BLUE}📦 Step 1: Building development images...${NC}"
docker compose -f docker-compose.dev.yml build --parallel

echo -e "${BLUE}📦 Step 2: Starting infrastructure services...${NC}"
docker compose -f docker-compose.dev.yml up -d postgres redis

echo -e "${BLUE}⏳ Step 3: Waiting for database to be ready...${NC}"
sleep 5

# Wait for PostgreSQL
echo "Waiting for PostgreSQL..."
until docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U "$POSTGRES_USER" > /dev/null 2>&1; do
    sleep 1
done
echo -e "${GREEN}✅ PostgreSQL is ready${NC}"

# Wait for Redis
echo "Waiting for Redis..."
until docker compose -f docker-compose.dev.yml exec -T redis redis-cli ping > /dev/null 2>&1; do
    sleep 1
done
echo -e "${GREEN}✅ Redis is ready${NC}"

echo -e "${BLUE}📦 Step 4: Starting xrules-engine...${NC}"
docker compose -f docker-compose.dev.yml up -d xrules-engine

echo -e "${BLUE}📦 Step 5: Starting xrules-api...${NC}"
docker compose -f docker-compose.dev.yml up -d xrules-api

echo -e "${BLUE}📦 Step 6: Starting xrules-studio...${NC}"
docker compose -f docker-compose.dev.yml up -d xrules-studio

echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}🎉 Development environment is ready!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
echo "📱 Services:"
echo "  🎨 Studio (UI):     http://localhost:3000"
echo "  🔧 API:             http://localhost:8080"
echo "  ⚡ Engine (gRPC):   localhost:50051"
echo "  ⚡ Engine (Metrics): http://localhost:9090"
echo ""
echo "🗄️  Infrastructure:"
echo "  🐘 PostgreSQL:      localhost:5432"
echo "  📦 Redis:           localhost:6379"
echo ""
echo "📋 Useful commands:"
echo "  ./scripts/dev-logs.sh     - View all logs"
echo "  ./scripts/dev-logs.sh api - View API logs only"
echo "  ./scripts/dev-stop.sh     - Stop all services"
echo "  ./scripts/dev-clean.sh    - Clean up volumes"
echo ""
