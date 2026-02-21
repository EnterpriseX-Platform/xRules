#!/bin/bash
# ==========================================
# XRULES Development Logs Script
# ==========================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

SERVICE=${1:-""}

if [ -z "$SERVICE" ]; then
    echo "📋 Viewing logs for all services..."
    echo "Press Ctrl+C to exit"
    echo ""
    docker compose -f docker-compose.dev.yml logs -f
else
    echo "📋 Viewing logs for $SERVICE..."
    echo "Press Ctrl+C to exit"
    echo ""
    docker compose -f docker-compose.dev.yml logs -f "$SERVICE"
fi
