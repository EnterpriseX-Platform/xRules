#!/bin/bash
# ==========================================
# XRULES Development Stop Script
# ==========================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "🛑 Stopping XRULES development environment..."
docker compose -f docker-compose.dev.yml down

echo "✅ All services stopped"
