#!/bin/bash
# ==========================================
# XRULES Development Clean Script
# WARNING: This will delete all data!
# ==========================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "⚠️  WARNING: This will delete all development data!"
echo "   - PostgreSQL data"
echo "   - Redis data"
echo "   - MinIO data"
echo "   - Build caches"
echo ""
read -p "Are you sure? (y/N): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🧹 Cleaning up..."
    docker-compose -f docker-compose.dev.yml down -v --remove-orphans
    docker volume prune -f
    echo "✅ Clean complete"
else
    echo "❌ Cancelled"
fi
